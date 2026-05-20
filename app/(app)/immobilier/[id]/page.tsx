import { Metadata } from 'next'
import { notFound }   from 'next/navigation'
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Home, Banknote, Receipt, TrendingUp, FileSpreadsheet, Activity, AlertTriangle, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }     from '@/components/shared/page-header'
import { Badge }          from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/shared/confidence-badge'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { PropertyLotActions, PropertyValuationActions } from '@/components/pages/property-detail-actions'
import { LotEditButton } from '@/components/pages/lot-edit-button'
import { SimulationPanel } from '@/components/real-estate/simulation-panel'
import { RegimeComparator } from '@/components/real-estate/regime-comparator'
import { SciDistribution } from '@/components/real-estate/sci-distribution'
import { IncentiveTabContent, type IncentiveRow } from '@/components/real-estate/incentives/incentive-tab'
import { buildIncentiveReductionPerYear } from '@/lib/real-estate/fiscal/incentives/reduction-schedule'
import { DeletePropertyButton } from '@/components/real-estate/delete-property-button'
import { ChargesForm } from '@/components/real-estate/charges-form'
import { TaxReductionDecomposition } from '@/components/real-estate/tax-reduction-decomposition'
import { RealTrackingPanel } from '@/components/real-estate/real-tracking-panel'
// ActualVsSimulation / DriftAlerts / RevisedForecastSection : conservés en code
// mais désactivés dans l'UI (le nouveau RealTrackingPanel remplace tout).
// YearEndReportPanel reste utilisé pour les bilans des années passées.
import { YearEndReportPanel } from '@/components/real-estate/year-end-report-panel'
import { CreditTab } from '@/components/real-estate/credit-tab'
import { MultiCreditList } from '@/components/real-estate/multi-credit-list'
import { UnderRentAlerts } from '@/components/real-estate/under-rent-alerts'
import { detectUnderRentAlerts } from '@/lib/real-estate/under-rent'
import { AmortizationTable } from '@/components/real-estate/amortization-table'
import type { ExistingCredit } from '@/components/real-estate/credit-form'
import { loadActualData } from '@/lib/real-estate/actual'
import { compareActualToSimulation } from '@/lib/real-estate/compare'
import { buildYearEndReport } from '@/lib/real-estate/year-end-report'
import { buildAmortizationSchedule } from '@/lib/real-estate/amortization'
import { aggregateLoans } from '@/lib/real-estate/multi-credit'
import type { LoanKind } from '@/types/database.types'
import { buildSimulationInputFromDb, runSimulation } from '@/lib/real-estate'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'
import type { LoanInput } from '@/lib/real-estate/types'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from '@/lib/real-estate/build-from-db'
import type { RealEstateProperty, PropertyUsageType } from '@/types/database.types'
import { USAGE_TYPE_LABELS, isRentalUsage } from '@/types/database.types'

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

  // Le client Supabase n'étant pas typé via le générique `Database`, `prop`
  // ressort en `any`. On l'aligne ici sur le type généré dans
  // types/database.types.ts (toutes les colonnes des migrations 005 et 006
  // y sont présentes) pour éliminer les casts `Record<string, unknown>`.
  const propTyped = prop as RealEstateProperty & typeof prop

  // Migration 033 : type d'usage du bien (résidence principale / secondaire /
  // locatif). Fallback `long_term_rental` pour les biens existants avant la
  // migration ou pour les rangs où la colonne n'est pas encore présente.
  const usageType: PropertyUsageType =
    (propTyped.usage_type as PropertyUsageType | undefined) ?? 'long_term_rental'
  const isRental    = isRentalUsage(usageType)
  const isPrimaryRP = usageType === 'primary_residence'

  // ── Dispositif fiscal (migration 038 — Pinel / Denormandie / MH / LocAv) ──
  const { data: incentiveRow } = await supabase
    .from('property_tax_incentives')
    .select('*')
    .eq('property_id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  // ── Crédits liés à cet asset (migration 034 : multi-crédit possible) ────
  // Note : on utilise select('*') plutôt que de lister les colonnes
  // explicitement, pour tolérer un environnement où les migrations 006
  // et 034 ne sont pas encore appliquées (loan_kind / insurance_base /
  // quotite / guarantee_type seront undefined, gérés par les ?? defaults).
  const { data: debtsRows } = await supabase
    .from('debts')
    .select('*')
    .eq('asset_id', prop.asset_id)
    .eq('user_id', user!.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  // Pour rétrocompat avec le code existant : on prend le "premier" crédit
  // comme crédit principal (typiquement le prêt principal). Le reste des
  // crédits est utilisé pour l'agrégation multi-prêt côté affichage.
  const allDebts = debtsRows ?? []
  const debtRow  = allDebts.find(d => (d.loan_kind ?? 'principal') === 'principal')
                ?? allDebts[0]
                ?? null

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

  // ── Calculs affichage ────────────────────────────────────────────────────
  const monthlyRents = lots
    .filter((l: { status: string }) => l.status === 'rented')
    .reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0)
  const annualRents  = monthlyRents * 12
  const annualCharges = charges
    ? Object.entries(charges)
        .filter(([k]) => ['taxe_fonciere','insurance','accountant','cfe','condo_fees','maintenance','other'].includes(k))
        .reduce((s, [, v]) => s + (Number(v) ?? 0), 0)
    : 0
  const acqCost     = (prop.purchase_price ?? 0) + (prop.purchase_fees ?? 0) + (prop.works_amount ?? 0)
  const currentVal  = prop.asset?.current_value ?? 0
  const grossYield  = acqCost > 0 ? (annualRents / acqCost) * 100 : 0
  const netYield    = acqCost > 0 ? ((annualRents - annualCharges) / acqCost) * 100 : 0
  const latentGain  = currentVal - acqCost
  const latentPct   = acqCost > 0 ? (latentGain / acqCost) * 100 : 0

  const LOT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'info' }> = {
    rented:         { label: 'Loué',    variant: 'success' },
    vacant:         { label: 'Vacant',  variant: 'warning' },
    owner_occupied: { label: 'Occupé',  variant: 'info' },
    works:          { label: 'Travaux', variant: 'muted' },
  }

  // ── Données typées pour SimulationPanel ─────────────────────────────────
  // Toutes les colonnes des migrations 005 / 006 sont déjà déclarées dans
  // RealEstateProperty (types/database.types.ts). On accède directement via
  // `propTyped` sans cast individuel.
  const dbProperty: DbProperty = {
    purchase_price:               propTyped.purchase_price,
    purchase_fees:                propTyped.purchase_fees,
    works_amount:                 propTyped.works_amount,
    furniture_amount:             propTyped.furniture_amount ?? 0,
    fiscal_regime:                propTyped.fiscal_regime,
    rental_index_pct:             propTyped.rental_index_pct ?? 2.0,
    charges_index_pct:            propTyped.charges_index_pct ?? 2.0,
    property_index_pct:           propTyped.property_index_pct ?? 1.0,
    land_share_pct:               propTyped.land_share_pct ?? 15,
    amort_building_years:         propTyped.amort_building_years ?? 30,
    amort_works_years:            propTyped.amort_works_years ?? 15,
    amort_furniture_years:        propTyped.amort_furniture_years ?? 7,
    gli_pct:                      propTyped.gli_pct ?? 0,
    management_pct:               propTyped.management_pct ?? 0,
    vacancy_months:               propTyped.vacancy_months ?? 0,
    lmp_ssi_rate:                 propTyped.lmp_ssi_rate ?? 35,
    acquisition_fees_treatment:   propTyped.acquisition_fees_treatment ?? 'expense_y1',
    lmnp_micro_abattement_pct:    propTyped.lmnp_micro_abattement_pct ?? 50,
    assumed_total_rent:           propTyped.assumed_total_rent ?? null,
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
    deferral_type:     debtRow.deferral_type     ?? 'none',
    deferral_months:   debtRow.deferral_months   ?? 0,
    insurance_base:    debtRow.insurance_base    ?? 'capital_initial',
    insurance_quotite: debtRow.insurance_quotite ?? 100,
    guarantee_type:    debtRow.guarantee_type    ?? 'caution',
  } : null

  const dbProfile: DbProfile | null = profileRow ? { tmi_rate: profileRow.tmi_rate } : null

  // ── Crédit "shape ExistingCredit" pour CreditTab ────────────────────────
  const creditForTab: ExistingCredit | null = debtRow ? {
    id:                 debtRow.id,
    name:               debtRow.name ?? 'Crédit',
    lender:             debtRow.lender,
    loan_kind:          (debtRow.loan_kind ?? 'principal') as LoanKind,
    initial_amount:     debtRow.initial_amount,
    interest_rate:      debtRow.interest_rate,
    insurance_rate:     debtRow.insurance_rate ?? 0,
    duration_months:    debtRow.duration_months,
    start_date:         debtRow.start_date,
    deferral_type:      (debtRow.deferral_type     ?? 'none') as 'none' | 'partial' | 'total',
    deferral_months:    debtRow.deferral_months   ?? 0,
    bank_fees:          debtRow.bank_fees         ?? 0,
    guarantee_fees:     debtRow.guarantee_fees    ?? 0,
    amortization_type:  (debtRow.amortization_type ?? 'constant') as 'constant' | 'linear' | 'in_fine',
    insurance_base:     (debtRow.insurance_base    ?? 'capital_initial') as 'capital_initial' | 'capital_remaining',
    insurance_quotite:  debtRow.insurance_quotite ?? 100,
    guarantee_type:     (debtRow.guarantee_type    ?? 'caution') as 'hypotheque' | 'caution' | 'ppd' | 'autre',
    notes:              debtRow.notes,
  } : null

  // ── Schedule & CRD à date (calculés côté serveur via lib pure) ──────────
  const loanForCalc: LoanInput | null = (
    creditForTab?.initial_amount != null &&
    creditForTab?.interest_rate != null &&
    creditForTab?.duration_months != null
  ) ? {
    principal:           creditForTab.initial_amount,
    annualRatePct:       creditForTab.interest_rate,
    durationYears:       creditForTab.duration_months / 12,
    insuranceRatePct:    creditForTab.insurance_rate ?? 0,
    bankFees:            creditForTab.bank_fees,
    guaranteeFees:       creditForTab.guarantee_fees,
    startDate:           creditForTab.start_date ? new Date(creditForTab.start_date) : undefined,
    deferralType:        creditForTab.deferral_type,
    deferralMonths:      creditForTab.deferral_months,
    insuranceBase:       creditForTab.insurance_base,
    insuranceQuotitePct: creditForTab.insurance_quotite,
  } : null

  // ── Multi-crédit (migration 034) ────────────────────────────────────────
  // Construit un LoanInput pour CHAQUE crédit actif puis agrège leur
  // schedule. Pour rétrocompat avec un bien à un seul crédit, le résultat
  // est strictement identique à l'ancien calcul.
  const allLoansForCalc: LoanInput[] = allDebts
    .filter(d =>
      d.initial_amount != null &&
      d.interest_rate  != null &&
      d.duration_months != null,
    )
    .map(d => ({
      principal:           d.initial_amount,
      annualRatePct:       d.interest_rate,
      durationYears:       d.duration_months / 12,
      insuranceRatePct:    d.insurance_rate ?? 0,
      bankFees:            d.bank_fees      ?? 0,
      guaranteeFees:       d.guarantee_fees ?? 0,
      startDate:           d.start_date ? new Date(d.start_date) : undefined,
      deferralType:        (d.deferral_type     ?? 'none')             as 'none' | 'partial' | 'total',
      deferralMonths:      d.deferral_months   ?? 0,
      insuranceBase:       (d.insurance_base    ?? 'capital_initial') as 'capital_initial' | 'capital_remaining',
      insuranceQuotitePct: d.insurance_quotite ?? 100,
    }))

  const multiCredit = aggregateLoans(allLoansForCalc, new Date())
  // Schedule du crédit principal (utilisé par l'onglet "Amortissement").
  const schedule = loanForCalc ? buildAmortizationSchedule(loanForCalc) : null
  // CRD à date — total tous prêts actifs confondus.
  const crdNow   = allLoansForCalc.length > 0
    ? multiCredit.totalRemainingCapital
    : 0

  // ── Alertes sous-loyer (migration 035) ──────────────────────────────────
  // Compare lot.rent_amount à lot.market_rent. Les lots sans market_rent
  // ou sans rent_amount sont ignorés (filtre fait par detectUnderRentAlerts).
  const underRentAlerts = isRental
    ? detectUnderRentAlerts(
        lots.map((l: {
          id: string; name: string;
          rent_amount: number | null;
          market_rent?: number | null;
        }) => ({
          id:          l.id,
          name:        l.name,
          rent_amount: l.rent_amount,
          market_rent: l.market_rent ?? null,
        })),
      )
    : []

  // ── Synthèse : KPIs financiers globaux ──────────────────────────────────
  // Mensualité totale = somme des mensualités de tous les crédits actifs
  // (migration 034). Pour un bien avec un seul crédit, équivalent à l'ancien.
  const monthlyLoanPayment = multiCredit.totalMonthly
  const monthlyCharges     = annualCharges / 12
  // Pour un bien locatif : cash-flow = loyers − charges − crédit.
  // Pour une RP / résidence secondaire sans location : pas de loyers, le KPI
  // équivalent est le « coût mensuel de possession » (charges + crédit), signe
  // négatif puisqu'il s'agit d'une sortie de trésorerie.
  const monthlyCashFlow    = isRental
    ? monthlyRents - monthlyCharges - monthlyLoanPayment
    : -(monthlyCharges + monthlyLoanPayment)
  const annualCashFlow     = monthlyCashFlow * 12
  const netPropertyValue   = currentVal - crdNow

  // ── Phase 2 : suivi réel vs simulation ──────────────────────────────────
  const downPayment = Math.max(0, acqCost - (dbDebt?.initial_amount ?? 0))
  const simInput    = buildSimulationInputFromDb(
    dbProperty, dbAsset, dbLots, dbCharges, dbDebt, dbProfile,
    { downPayment },
  )

  // ── Réduction d'impôt annuelle (Pinel / Denormandie) ───────────────────
  // On construit le tableau d'imputation année par année à partir du
  // dispositif fiscal actif (table property_tax_incentives).
  // Hors fenêtre [start_year, start_year + duration - 1] → 0.
  const incentiveReductionPerYear = buildIncentiveReductionPerYear(
    incentiveRow,
    simInput.property,
    simInput.rent,
    dbProfile?.tmi_rate ?? 30,
    simInput.horizonYears ?? 25,
  )
  const simInputWithIncentive = { ...simInput, incentiveReductionPerYear }
  const simResult = runSimulation(simInputWithIncentive)

  const actualData  = await loadActualData(
    supabase, user!.id, prop.asset_id, prop.id, debtRow?.id ?? null,
  )

  // ── Événements suivi réel (migration 041) ──────────────────────────────
  // Filtre par année courante. Le nouveau RealTrackingPanel utilise cette
  // liste avec la base (loyers + charges + crédit) pour calculer le réel.
  const trackingYear = new Date().getUTCFullYear()
  const { data: eventsRows } = await supabase
    .from('property_events')
    .select('*')
    .eq('property_id', prop.id)
    .eq('user_id', user!.id)
    .gte('event_date', `${trackingYear}-01-01`)
    .lte('event_date', `${trackingYear}-12-31`)
    .order('event_date', { ascending: false })
  const propertyEvents = (eventsRows ?? []) as import('@/types/database.types').PropertyEvent[]

  const simStartYear = debtRow?.start_date
    ? new Date(debtRow.start_date).getUTCFullYear()
    : (actualData.firstYear ?? new Date().getUTCFullYear())

  // Legacy : ces calculs alimentaient ActualVsSimulation / DriftAlerts /
  // RevisedForecast — désactivés dans l'UI (nouveau RealTrackingPanel).
  // Le `comparison` reste utilisé par YearEndReportPanel pour les bilans
  // d'années passées. Les variables driftAlerts / revisedForecast ne sont
  // plus consommées — voir hist commit pour rétablir si besoin.
  const comparison = compareActualToSimulation(simResult, actualData, simStartYear)
  void comparison   // explicitement marqué utilisé pour ne pas casser le calcul

  const reportCutoffYear = new Date().getUTCFullYear()
  const yearEndReports = actualData.years
    .filter((a) => a.year < reportCutoffYear)
    .sort((a, b) => b.year - a.year)
    .map((a) => {
      const projForYear = simResult.projection.find((p) => p.year === a.year - simStartYear + 1) ?? null
      return buildYearEndReport(
        a.year,
        prop.id,
        prop.asset?.name,
        (dbProperty.fiscal_regime ?? 'foncier_nu') as Parameters<typeof buildYearEndReport>[3],
        projForYear,
        a,
        simResult.amortization,
        simStartYear,
      )
    })

  // ─── Onglets ──────────────────────────────────────────────────────────────

  const tabs: TabItem[] = [
    // ── 1. Synthèse ─────────────────────────────────────────────────────────
    {
      id:    'synthese',
      label: 'Synthèse',
      icon:  <Home size={14} />,
      content: (
        <div className="space-y-6">
          {/* KPIs principaux : 6 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest">Valeur estimée</p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(currentVal, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">{formatDate(prop.asset?.last_valued_at, 'medium')}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Capital restant dû</p>
              <p className={`text-xl font-semibold financial-value mt-2 ${crdNow > 0 ? 'text-danger' : 'text-secondary'}`}>
                {crdNow > 0 ? formatCurrency(crdNow, 'EUR', { compact: true }) : '—'}
              </p>
              <p className="text-xs text-secondary mt-1">à aujourd&apos;hui</p>
            </div>
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest">Patrimoine net</p>
              <p className="text-xl font-semibold financial-value text-accent mt-2">
                {formatCurrency(netPropertyValue, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">valeur − CRD</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">
                {isRental ? 'Cash-flow mensuel' : 'Coût mensuel de possession'}
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${monthlyCashFlow >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(monthlyCashFlow, 'EUR')}
              </p>
              <p className="text-xs text-secondary mt-1">
                {isRental ? 'loyers − charges − crédit' : 'charges + crédit'}
              </p>
            </div>
            {isRental ? (
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest">Rendement brut</p>
                <p className="text-xl font-semibold financial-value text-primary mt-2">
                  {grossYield > 0 ? formatPercent(grossYield) : '—'}
                </p>
                <p className="text-xs text-secondary mt-1">Net : {netYield > 0 ? formatPercent(netYield) : '—'}</p>
              </div>
            ) : (
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest">Type d&apos;usage</p>
                <p className="text-sm font-medium text-primary mt-2">
                  {USAGE_TYPE_LABELS[usageType]}
                </p>
                <p className="text-xs text-secondary mt-1">
                  Pas de calcul de rentabilité pour ce type d&apos;usage.
                </p>
              </div>
            )}
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Plus-value latente</p>
              <p className={`text-xl font-semibold financial-value mt-2 ${latentGain >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
              </p>
              <p className="text-xs text-secondary mt-1">{formatPercent(latentPct, { sign: true })}</p>
            </div>
          </div>

          {/* Alertes sous-loyer (migration 035) */}
          {underRentAlerts.length > 0 && (
            <UnderRentAlerts alerts={underRentAlerts} />
          )}

          {/* Lots + Historique valorisations */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {isPrimaryRP ? (
              <div className="lg:col-span-3 card p-6 text-sm text-secondary">
                Résidence principale — pas de lots locatifs.
              </div>
            ) : (
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
                    market_rent: number | null;
                    tenant_name: string | null; lease_start_date: string | null; lease_end_date: string | null
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
            )}

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
        </div>
      ),
    },

    // ── 2. Crédit ──────────────────────────────────────────────────────────
    {
      id:    'credit',
      label: 'Crédit',
      icon:  <Banknote size={14} />,
      content: (
        <div className="space-y-6">
          {/* Vue d'ensemble multi-crédit (migration 034) */}
          {allDebts.length > 0 && (
            <MultiCreditList
              credits={allDebts.map(d => ({
                id:               d.id,
                loan_kind:        (d.loan_kind ?? 'principal') as LoanKind,
                lender:           d.lender ?? null,
                initial_amount:   d.initial_amount,
                interest_rate:    d.interest_rate,
                insurance_rate:   d.insurance_rate ?? 0,
                duration_months:  d.duration_months,
                start_date:       d.start_date,
              }))}
              totalMonthly={multiCredit.totalMonthly}
              totalRemainingCapital={multiCredit.totalRemainingCapital}
            />
          )}

          {/* Formulaire d'édition du crédit principal (création / modification) */}
          <CreditTab
            propertyId={prop.id}
            propertyName={prop.asset?.name}
            credit={creditForTab}
          />
        </div>
      ),
    },

    // ── 3. Tableau d'amortissement ────────────────────────────────────────
    {
      id:    'amortissement',
      label: 'Amortissement',
      icon:  <FileSpreadsheet size={14} />,
      content: schedule ? (
        <AmortizationTable
          schedule={schedule}
          startDate={creditForTab?.start_date ? new Date(creditForTab.start_date) : null}
          propertyName={prop.asset?.name}
        />
      ) : (
        <div className="card p-8 text-center text-sm text-secondary">
          Aucun crédit configuré — l&apos;onglet « Crédit » permet d&apos;en ajouter un.
        </div>
      ),
    },

    // ── 4. Rentabilité & Cash-flow ────────────────────────────────────────
    {
      id:    'rentabilite',
      label: 'Rentabilité & Cash-flow',
      icon:  <TrendingUp size={14} />,
      content: (
        <div className="space-y-6">
          <SimulationPanel
            propertyId={prop.id}
            property={dbProperty}
            asset={dbAsset}
            lots={dbLots}
            charges={dbCharges}
            debt={dbDebt}
            profile={dbProfile}
          />
          {/* Décomposition fiscale Y1 — si dispositif Pinel/Denormandie/LocAv actif */}
          {simResult.projection[0] && simResult.projection[0].taxReductionTotal > 0 && (
            <TaxReductionDecomposition
              taxBeforeReduction={
                simResult.projection[0].taxPaid + simResult.projection[0].taxReductionApplied
              }
              taxReductionTotal={simResult.projection[0].taxReductionTotal}
              taxReductionApplied={simResult.projection[0].taxReductionApplied}
              taxReductionLost={simResult.projection[0].taxReductionLost}
              taxPaid={simResult.projection[0].taxPaid}
              incentiveLabel={
                incentiveRow?.kind === 'pinel'         ? 'Pinel' :
                incentiveRow?.kind === 'pinel_plus'    ? 'Pinel+' :
                incentiveRow?.kind === 'denormandie'   ? 'Denormandie' :
                incentiveRow?.kind === 'loc_avantages' ?
                  `Loc'Avantages ${(incentiveRow.convention_type ?? '').toUpperCase()}` :
                undefined
              }
            />
          )}

          {/* Distribution SCI IS — uniquement si régime sci_is */}
          {propTyped.fiscal_regime === 'sci_is' && simResult.projection[0] && (
            <SciDistribution
              netProfitAfterIS={
                // Cash après IS pour Y1 (basé sur la projection)
                simResult.projection[0].cashFlowAfterTax + simResult.projection[0].principalRepaid
              }
              ccaAmount={(propTyped as unknown as { cca_amount?: number | null }).cca_amount ?? 0}
              tmiPct={dbProfile?.tmi_rate ?? 30}
            />
          )}

          {isRental && !simResult.incompleteData && (
            <RegimeComparator
              base={{
                property:    simInput.property,
                // Si loan partiel, on l'ignore (le comparateur fonctionne aussi sans).
                loan:        loanForCalc ?? undefined,
                rent:        simInput.rent,
                charges:     simInput.charges,
                downPayment: simInput.downPayment,
                horizonYears: simInput.horizonYears,
              }}
              defaultTmiPct={dbProfile?.tmi_rate ?? 30}
            />
          )}
        </div>
      ),
    },

    // ── 5. Charges ─────────────────────────────────────────────────────────
    {
      id:    'charges',
      label: 'Charges',
      icon:  <Receipt size={14} />,
      content: (
        <div className="space-y-4">
          <ChargesForm
            propertyId={prop.id}
            year={currentYear}
            monthlyRent={monthlyRents}
            usageType={usageType}
            fiscalRegime={propTyped.fiscal_regime}
            initial={charges ?? null}
          />

          {/* Historique multi-années */}
          {chargesAll.length > 1 && (
            <div className="card p-6">
              <h2 className="text-sm font-medium text-primary mb-4">Historique des charges</h2>
              <table className="w-full text-xs">
                <thead className="bg-surface-2">
                  <tr className="text-muted uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Année</th>
                    <th className="px-3 py-2 text-right">Taxe fonc.</th>
                    <th className="px-3 py-2 text-right">Assurance</th>
                    <th className="px-3 py-2 text-right">Copro</th>
                    <th className="px-3 py-2 text-right">Autres</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...chargesAll].sort((a, b) => b.year - a.year).map((c: {
                    year: number; taxe_fonciere: number; insurance: number; accountant: number;
                    cfe: number; condo_fees: number; maintenance: number; other: number
                  }) => {
                    const tot = c.taxe_fonciere + c.insurance + c.accountant + c.cfe + c.condo_fees + c.maintenance + c.other
                    return (
                      <tr key={c.year} className="hover:bg-surface-2/50">
                        <td className="px-3 py-2 text-secondary font-medium">{c.year}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.taxe_fonciere, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.insurance, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.condo_fees, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(c.accountant + c.cfe + c.maintenance + c.other, 'EUR')}</td>
                        <td className="px-3 py-2 text-right financial-value text-primary font-medium">{formatCurrency(tot, 'EUR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ),
    },

    // ── 6. Suivi réel — refonte modèle base + événements (migration 041) ──
    {
      id:    'suivi-reel',
      label: 'Suivi réel',
      icon:  <Activity size={14} />,
      content: (
        <div className="space-y-6">
          <RealTrackingPanel
            propertyId={prop.id}
            year={trackingYear}
            lots={lots.map((l: { id: string; name: string; rent_amount: number | null; status: string }) => ({
              id:          l.id,
              name:        l.name,
              rent_amount: l.rent_amount,
            }))}
            monthlyRent={monthlyRents}
            annualCharges={annualCharges}
            monthlyLoanPayment={schedule?.totalMonthly ?? 0}
            events={propertyEvents}
          />

          {/* Vues complémentaires (legacy) — laissé en arrière-plan pour
              ceux qui ont déjà des transactions. À supprimer dans un sprint
              ultérieur une fois le nouveau modèle validé. */}
          {yearEndReports.length > 0 && (
            <div className="border-t border-border pt-6">
              <YearEndReportPanel reports={yearEndReports} />
            </div>
          )}
        </div>
      ),
    },

    // ── 7. Dispositif fiscal ────────────────────────────────────────────────
    {
      id:    'dispositif',
      label: 'Dispositif fiscal',
      icon:  <Sparkles size={14} />,
      content: <IncentiveTabContent
        propertyId={prop.id}
        incentive={incentiveRow as IncentiveRow | null}
        annualRentHC={annualRents}
        purchasePrice={prop.purchase_price ?? 0}
        surfaceM2={prop.surface_m2 ?? 0}
        tmiPct={dbProfile?.tmi_rate ?? 30}
      />,
    },

    // CF / annualCashFlow utilisé pour les calculs internes uniquement (visible dans Synthèse)
  ]

  // Petite garde TS : éviter l'erreur "annualCashFlow declared but unused" si on ne l'affiche pas
  void annualCashFlow

  const fiscalRegimeMissing = !prop.fiscal_regime

  return (
    <div className="space-y-6">
      <Link href="/immobilier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour à l&apos;immobilier
      </Link>

      <PageHeader
        title={prop.asset?.name ?? 'Bien immobilier'}
        subtitle={[prop.address_zip, prop.address_city].filter(Boolean).join(' ') || undefined}
        action={
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={prop.asset?.confidence ?? 'medium'} />
            <DeletePropertyButton
              propertyId={prop.id}
              propertyName={prop.asset?.name ?? 'ce bien'}
              redirectTo="/immobilier"
            />
          </div>
        }
      />

      {fiscalRegimeMissing && (
        <div className="card border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-primary">Régime fiscal non défini</p>
            <p className="text-secondary mt-1">
              La rentabilité nette et l&apos;impôt estimé affichés ci-dessous ne peuvent
              pas être calculés de manière fiable tant qu&apos;un régime fiscal n&apos;est
              pas associé à ce bien. Recréez ce bien en sélectionnant un régime
              (LMNP, SCI à l&apos;IS, foncier réel, etc.) pour obtenir une projection exacte.
            </p>
          </div>
        </div>
      )}

      <Tabs tabs={tabs} urlParam="tab" />
    </div>
  )
}
