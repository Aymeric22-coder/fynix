import { Metadata } from 'next'
import { notFound }   from 'next/navigation'
import { ArrowLeft, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }     from '@/components/shared/page-header'
import { Badge }          from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/shared/confidence-badge'
import { PropertyLotActions, PropertyValuationActions } from '@/components/pages/property-detail-actions'
import { LotEditButton } from '@/components/pages/lot-edit-button'
import { SimulationPanel } from '@/components/real-estate/simulation-panel'
import { ActualVsSimulation } from '@/components/real-estate/actual-vs-simulation'
import { loadActualData } from '@/lib/real-estate/actual'
import { compareActualToSimulation } from '@/lib/real-estate/compare'
import { buildSimulationInputFromDb, runSimulation } from '@/lib/real-estate'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from '@/lib/real-estate/build-from-db'

export const metadata: Metadata = { title: 'Détail bien' }

type Props = { params: Promise<{ id: string }> }

export default async function ImmobilierDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Bien immobilier complet ──────────────────────────────────────────────
  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id (*),
      lots:real_estate_lots (*),
      valuations:property_valuations ( id, valuation_date, value, price_per_m2, source, confidence ),
      charges:property_charges (*)
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .order('valuation_date', { referencedTable: 'valuations', ascending: false })
    .single()

  if (!prop) notFound()

  // ── Crédit lié à cet asset (s'il existe) ────────────────────────────────
  const { data: debtRow } = await supabase
    .from('debts')
    .select(`
      id, initial_amount, interest_rate, insurance_rate,
      duration_months, start_date, bank_fees, guarantee_fees, amortization_type
    `)
    .eq('asset_id', prop.asset_id)
    .eq('user_id', user!.id)
    .eq('status', 'active')
    .maybeSingle()

  // ── Profil utilisateur (TMI) ─────────────────────────────────────────────
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('tmi_rate')
    .eq('id', user!.id)
    .maybeSingle()

  // ── Charges de l'année courante ──────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const lots        = prop.lots ?? []
  const chargesAll  = prop.charges ?? []
  const charges     = chargesAll.find((c: { year: number }) => c.year === currentYear) ?? null

  // ── Calculs affichage (section existante) ────────────────────────────────
  const monthlyRents = lots
    .filter((l: { status: string }) => l.status === 'rented')
    .reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0)
  const annualRents  = monthlyRents * 12
  const annualCharges = charges
    ? Object.entries(charges)
        .filter(([k]) => ['taxe_fonciere','insurance','accountant','cfe','condo_fees','maintenance','other'].includes(k))
        .reduce((s, [, v]) => s + (Number(v) ?? 0), 0)
    : 0
  const acqCost    = (prop.purchase_price ?? 0) + (prop.purchase_fees ?? 0) + (prop.works_amount ?? 0)
  const currentVal = prop.asset?.current_value ?? 0
  const grossYield = acqCost > 0 ? (annualRents / acqCost) * 100 : 0
  const netYield   = acqCost > 0 ? ((annualRents - annualCharges) / acqCost) * 100 : 0
  const latentGain = currentVal - acqCost
  const latentPct  = acqCost > 0 ? (latentGain / acqCost) * 100 : 0

  const LOT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'info' }> = {
    rented:         { label: 'Loué',    variant: 'success' },
    vacant:         { label: 'Vacant',  variant: 'warning' },
    owner_occupied: { label: 'Occupé',  variant: 'info' },
    works:          { label: 'Travaux', variant: 'muted' },
  }

  // ── Données typées pour SimulationPanel ─────────────────────────────────
  const dbProperty: DbProperty = {
    purchase_price:               prop.purchase_price,
    purchase_fees:                prop.purchase_fees,
    works_amount:                 prop.works_amount,
    furniture_amount:             (prop as Record<string,unknown>).furniture_amount as number ?? 0,
    fiscal_regime:                prop.fiscal_regime,
    rental_index_pct:             (prop as Record<string,unknown>).rental_index_pct as number ?? 2.0,
    charges_index_pct:            (prop as Record<string,unknown>).charges_index_pct as number ?? 2.0,
    property_index_pct:           (prop as Record<string,unknown>).property_index_pct as number ?? 1.0,
    land_share_pct:               (prop as Record<string,unknown>).land_share_pct as number ?? 15,
    amort_building_years:         (prop as Record<string,unknown>).amort_building_years as number ?? 30,
    amort_works_years:            (prop as Record<string,unknown>).amort_works_years as number ?? 15,
    amort_furniture_years:        (prop as Record<string,unknown>).amort_furniture_years as number ?? 7,
    gli_pct:                      (prop as Record<string,unknown>).gli_pct as number ?? 0,
    management_pct:               (prop as Record<string,unknown>).management_pct as number ?? 0,
    vacancy_months:               (prop as Record<string,unknown>).vacancy_months as number ?? 0,
    lmp_ssi_rate:                 (prop as Record<string,unknown>).lmp_ssi_rate as number ?? 35,
    acquisition_fees_treatment:   (prop as Record<string,unknown>).acquisition_fees_treatment as string ?? 'expense_y1',
    lmnp_micro_abattement_pct:    (prop as Record<string,unknown>).lmnp_micro_abattement_pct as number ?? 50,
    assumed_total_rent:           (prop as Record<string,unknown>).assumed_total_rent as number | null ?? null,
  }

  const dbAsset: DbAsset | null = prop.asset ? { current_value: prop.asset.current_value } : null

  const dbLots: DbLot[] = lots.map((l: { rent_amount: number | null; status?: string }) => ({
    rent_amount: l.rent_amount,
    status:      l.status,
  }))

  const dbCharges: DbCharges | null = charges ? {
    taxe_fonciere: charges.taxe_fonciere,
    insurance:     charges.insurance,
    accountant:    charges.accountant,
    cfe:           charges.cfe,
    condo_fees:    charges.condo_fees,
    maintenance:   charges.maintenance,
    other:         charges.other,
  } : null

  const dbDebt: DbDebt | null = debtRow ? {
    initial_amount:    debtRow.initial_amount,
    interest_rate:     debtRow.interest_rate,
    insurance_rate:    debtRow.insurance_rate,
    duration_months:   debtRow.duration_months,
    start_date:        debtRow.start_date,
    bank_fees:         debtRow.bank_fees ?? 0,
    guarantee_fees:    debtRow.guarantee_fees ?? 0,
    amortization_type: debtRow.amortization_type ?? 'constant',
  } : null

  const dbProfile: DbProfile | null = profileRow ? { tmi_rate: profileRow.tmi_rate } : null

  // ── Phase 2 : suivi réel vs simulation ──────────────────────────────────
  // On lance une simulation snapshot (paramètres DB) pour comparer aux données réelles.
  // Note : le SimulationPanel interactif peut diverger si l'utilisateur joue avec les inputs,
  //        mais la comparaison se base sur l'état *enregistré* en DB (source de vérité).
  const downPayment = Math.max(0, acqCost - (dbDebt?.initial_amount ?? 0))
  const simInput    = buildSimulationInputFromDb(
    dbProperty, dbAsset, dbLots, dbCharges, dbDebt, dbProfile,
    { downPayment },
  )
  const simResult   = runSimulation(simInput)

  const actualData  = await loadActualData(
    supabase, user!.id, prop.asset_id, prop.id, debtRow?.id ?? null,
  )

  // Année de départ de la simulation : si on a un crédit avec start_date, on l'utilise,
  // sinon on prend l'année de la première donnée réelle, sinon l'année courante.
  const simStartYear = debtRow?.start_date
    ? new Date(debtRow.start_date).getUTCFullYear()
    : (actualData.firstYear ?? new Date().getUTCFullYear())

  const comparison  = compareActualToSimulation(simResult, actualData, simStartYear)

  return (
    <div className="space-y-8">
      <Link href="/immobilier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour à l&apos;immobilier
      </Link>

      <PageHeader
        title={prop.asset?.name ?? 'Bien immobilier'}
        subtitle={[prop.address_zip, prop.address_city].filter(Boolean).join(' ') || undefined}
        action={<ConfidenceBadge level={prop.asset?.confidence ?? 'medium'} />}
      />

      {/* KPIs courants (données réelles, non simulées) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Valeur estimée',    value: formatCurrency(currentVal, 'EUR', { compact: true }), sub: formatDate(prop.asset?.last_valued_at, 'medium'), accent: true },
          { label: 'Prix de revient',   value: formatCurrency(acqCost, 'EUR', { compact: true }), sub: `Dont travaux : ${formatCurrency(prop.works_amount, 'EUR')}` },
          { label: 'Rendement brut',    value: grossYield > 0 ? formatPercent(grossYield) : '—', sub: `Net : ${netYield > 0 ? formatPercent(netYield) : '—'}` },
          { label: 'Plus-value latente',value: formatCurrency(latentGain, 'EUR', { compact: true, sign: true }), sub: formatPercent(latentPct, { sign: true }) },
        ].map((kpi) => (
          <div key={kpi.label} className={`card p-5 ${kpi.accent ? 'border-accent/20' : ''}`}>
            <p className="text-xs text-secondary uppercase tracking-widest">{kpi.label}</p>
            <p className="text-xl font-semibold financial-value text-primary mt-2">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-secondary mt-1">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Lots */}
        <div className="lg:col-span-3 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-primary">
              Lots locatifs {monthlyRents > 0 && <span className="text-accent ml-1">{formatCurrency(monthlyRents, 'EUR')} / mois</span>}
            </h2>
            <PropertyLotActions propertyId={prop.id} />
          </div>
          {!lots.length ? (
            <p className="text-sm text-secondary">Aucun lot — ajoutez des unités locatives.</p>
          ) : (
            <div className="space-y-2">
              {lots.map((lot: {
                id: string; name: string; lot_type: string | null; surface_m2: number | null;
                status: string; rent_amount: number | null; charges_amount: number | null;
                tenant_name: string | null; lease_start: string | null; lease_end: string | null
              }) => {
                const statusInfo = LOT_STATUS[lot.status] ?? { label: lot.status, variant: 'muted' as const }
                return (
                  <div key={lot.id} className="flex items-center gap-4 p-3 bg-surface-2 rounded-lg group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-primary font-medium">{lot.name}</p>
                      {lot.tenant_name && <p className="text-xs text-secondary">{lot.tenant_name}</p>}
                    </div>
                    {lot.surface_m2 && <p className="text-xs text-secondary">{lot.surface_m2} m²</p>}
                    {lot.rent_amount && (
                      <p className="text-sm financial-value text-accent">
                        {formatCurrency(lot.rent_amount, 'EUR')}
                      </p>
                    )}
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    <LotEditButton lot={lot} propertyId={prop.id} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Historique valorisations */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-primary">Historique des estimations</h2>
            <PropertyValuationActions propertyId={prop.id} surfaceM2={prop.surface_m2} />
          </div>
          {!(prop.valuations ?? []).length ? (
            <p className="text-sm text-secondary">Aucune estimation enregistrée.</p>
          ) : (
            <div className="space-y-3">
              {(prop.valuations ?? []).slice(0, 6).map((v: {
                id: string; valuation_date: string; value: number;
                price_per_m2: number | null; confidence: string
              }, i: number) => {
                const prev  = (prop.valuations ?? [])[i + 1]
                const delta = prev ? v.value - prev.value : null
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm financial-value text-primary">{formatCurrency(v.value, 'EUR', { compact: true })}</p>
                      <p className="text-xs text-secondary">{formatDate(v.valuation_date, 'medium')}</p>
                    </div>
                    {delta !== null && (
                      <p className={`text-xs flex items-center gap-0.5 ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {formatCurrency(Math.abs(delta), 'EUR', { compact: true })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Charges annuelles */}
      {charges && (
        <div className="card p-6">
          <h2 className="text-sm font-medium text-primary mb-4">
            Charges {currentYear} · {formatCurrency(annualCharges, 'EUR')} total
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Taxe foncière',     value: charges.taxe_fonciere },
              { label: 'Assurance',         value: charges.insurance },
              { label: 'Expert-comptable',  value: charges.accountant },
              { label: 'CFE',               value: charges.cfe },
              { label: 'Copropriété',       value: charges.condo_fees },
              { label: 'Entretien',         value: charges.maintenance },
              { label: 'Autres',            value: charges.other },
            ].filter((c) => c.value > 0).map((c) => (
              <div key={c.label}>
                <p className="text-xs text-secondary">{c.label}</p>
                <p className="text-sm financial-value text-primary mt-0.5">{formatCurrency(c.value, 'EUR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Simulation & Projection ─────────────────────────────────────── */}
      <div className="border-t border-border pt-8">
        <SimulationPanel
          propertyId={prop.id}
          property={dbProperty}
          asset={dbAsset}
          lots={dbLots}
          charges={dbCharges}
          debt={dbDebt}
          profile={dbProfile}
        />
      </div>

      {/* ── Suivi réel vs Simulation (Phase 2) ─────────────────────────── */}
      <div className="border-t border-border pt-8">
        <ActualVsSimulation
          comparison={comparison}
          propertyName={prop.asset?.name}
          assetId={prop.asset_id}
          debtId={debtRow?.id ?? null}
          propertyId={prop.id}
          monthlyRentSuggested={monthlyRents}
          monthlyPaymentSuggested={simResult.kpis.monthlyPayment > 0 ? simResult.kpis.monthlyPayment : null}
          existingCharges={(prop.charges ?? []).map((c: {
            year: number; taxe_fonciere: number; insurance: number; accountant: number;
            cfe: number; condo_fees: number; maintenance: number; other: number
          }) => ({
            year:          c.year,
            taxe_fonciere: c.taxe_fonciere,
            insurance:     c.insurance,
            accountant:    c.accountant,
            cfe:           c.cfe,
            condo_fees:    c.condo_fees,
            maintenance:   c.maintenance,
            other:         c.other,
          }))}
        />
      </div>
    </div>
  )
}
