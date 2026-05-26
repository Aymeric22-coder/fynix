import { Metadata }     from 'next'
import { Building2, AlertTriangle } from 'lucide-react'
import { createServerClient }            from '@/lib/supabase/server'
import { PageHeader }                    from '@/components/shared/page-header'
import { EmptyState }                    from '@/components/ui/empty-state'
import { ChargesWarningBanner }          from '@/components/ui/charges-warning-banner'
import { ImmobilierActions }             from '@/components/pages/immobilier-actions'
import { computeRealEstatePortfolio }    from '@/lib/real-estate/portfolio'
import { detectLmpStatus, sumMeubleeRevenues } from '@/lib/real-estate/fiscal/lmp-detector'
import { computeUnpaidRentAlerts }       from '@/lib/real-estate/property-alerts'
import {
  buildPropertySummariesFromPortfolio,
  computePortfolioSummary,
  type PropertyMetaForPortfolio,
} from '@/lib/real-estate/portfolio-summary'
import type { FiscalRegimeKind } from '@/lib/real-estate/types'
import type { PropertyUsageType } from '@/types/database.types'
import { PortfolioKpis }    from '@/components/real-estate/portfolio/portfolio-kpis'
import { PortfolioView }    from '@/components/real-estate/portfolio/portfolio-view'
import { PropertyCard }     from '@/components/real-estate/portfolio/property-card'

export const metadata: Metadata = { title: 'Immobilier' }

export default async function ImmobilierPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Propriétés ──────────────────────────────────────────────────────────
  const { data: properties } = await supabase
    .from('real_estate_properties')
    .select(`
      id, asset_id, property_type, address_city, address_zip, surface_m2,
      purchase_price, purchase_fees, works_amount, fiscal_regime, usage_type,
      latitude, longitude,
      asset:assets!asset_id ( name, current_value, acquisition_price, acquisition_date, status ),
      lots:real_estate_lots ( id, status, rent_amount, charges_amount )
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  // ── Profil : revenus pro pour détection LMP ─────────────────────────────
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('professional_income_eur')
    .eq('id', user!.id)
    .maybeSingle()
  const professionalIncomeEur =
    (profileRow?.professional_income_eur as number | null | undefined) ?? 0

  // ── Détection LMNP → LMP ────────────────────────────────────────────────
  const meubleeRevenues = sumMeubleeRevenues(
    (properties ?? []).map((p) => ({
      fiscal_regime: p.fiscal_regime,
      annualMeubleeRevenues: (p.lots ?? [])
        .filter((l: { status: string }) => l.status === 'rented')
        .reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0) * 12,
    })),
  )
  const lmpStatus = detectLmpStatus(meubleeRevenues, { professionalIncomeEur })
  const hasLmnpProperty = (properties ?? []).some(
    p => p.fiscal_regime === 'lmnp_reel' || p.fiscal_regime === 'lmnp_micro',
  )
  const showLmpAlert = lmpStatus.isLmp && hasLmnpProperty

  // ── Simulation par bien (CRD analytique + KPIs) ────────────────────────
  const portfolio = await computeRealEstatePortfolio(supabase, user!.id)

  // ── Charges saisies (banner) ────────────────────────────────────────────
  const propIds = (properties ?? []).map((p) => p.id)
  const propsWithChargesSet = new Set<string>()
  if (propIds.length > 0) {
    const { data: chargesRows } = await supabase
      .from('property_charges')
      .select('property_id')
      .in('property_id', propIds)
    for (const c of chargesRows ?? []) propsWithChargesSet.add(c.property_id as string)
  }
  const estimatedCount = (properties ?? []).filter((p) => !propsWithChargesSet.has(p.id)).length

  // ── V11 — Impayés non résolus (CAS-DASH-001 / INTEG-003) ───────────────
  // Query batchée des events `rent_unpaid` non résolus pour tous les biens
  // de l'utilisateur. La RLS filtre déjà par user_id, mais on borne quand
  // même au sous-ensemble des biens chargés ci-dessus (limite la charge).
  const unpaidByProp = new Map<string, ReturnType<typeof computeUnpaidRentAlerts>[number]>()
  if (propIds.length > 0) {
    const { data: unpaidEvents } = await supabase
      .from('property_events')
      .select('property_id, kind, is_resolved, event_date, amount_eur')
      .eq('user_id', user!.id)
      .eq('kind', 'rent_unpaid')
      .eq('is_resolved', false)
      .in('property_id', propIds)
    const summaries = computeUnpaidRentAlerts(unpaidEvents ?? [], new Date())
    for (const s of summaries) unpaidByProp.set(s.propertyId, s)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  type AssetJoin = { name: string; current_value: number | null; acquisition_price: number | null; acquisition_date: string | null; status: string }
  const getAsset = (raw: unknown): AssetJoin | null =>
    Array.isArray(raw) ? (raw[0] ?? null) : (raw as AssetJoin | null)

  // ── Construction des PropertySummary[] (V5 — via le moteur) ────────────
  // On ne calcule plus en parallèle totalCost / monthlyRent / monthlyCharges :
  // le helper V5 `buildPropertySummariesFromPortfolio` lit ces valeurs
  // directement depuis `sim.simulation` (kpis + projection Y1), garantissant
  // que le bandeau du haut affiche les MÊMES chiffres que les cartes.
  //
  // V11 — `alertCount` et `unpaidRent` alimentés depuis `unpaidByProp`
  // (CAS-DASH-001 / INTEG-003). Seuil 1 event = alerte info immédiate ;
  // sévérité progressive sur ancienneté / nombre.
  const metas: PropertyMetaForPortfolio[] = (properties ?? []).map((p) => {
    const asset  = getAsset(p.asset)
    const unpaid = unpaidByProp.get(p.id as string)
    return {
      id:           p.id as string,
      name:         asset?.name ?? 'Bien immobilier',
      city:         p.address_city ?? null,
      usageType:    (p.usage_type ?? 'long_term_rental') as PropertyUsageType,
      fiscalRegime: (p.fiscal_regime ?? null) as FiscalRegimeKind | null,
      currentValue: asset?.current_value ?? null,
      isShortTerm:  p.usage_type === 'short_term_rental',
      alertCount:   unpaid?.count ?? 0,
      ...(unpaid ? {
        unpaidRent: {
          count:           unpaid.count,
          totalEur:        unpaid.totalUnpaidEur,
          daysSinceOldest: unpaid.daysSinceOldest,
          severity:        unpaid.severity,
        },
      } : {}),
    }
  })

  const summaries = buildPropertySummariesFromPortfolio(portfolio.properties, metas)
  const portfolioSummary = computePortfolioSummary(summaries)

  // ── Render des cartes pre-calculees (server-side) ───────────────────────
  // Le PortfolioView client peut ainsi router les cartes selon les filtres
  // sans re-rendre l'arbre serveur.
  const simByProp = new Map(portfolio.properties.map((p) => [p.propertyId, p]))
  const cardsByPropertyId: Record<string, React.ReactNode> = {}
  for (const p of properties ?? []) {
    const asset = getAsset(p.asset)
    const sim   = simByProp.get(p.id)
    cardsByPropertyId[p.id as string] = (
      <PropertyCard
        id={p.id as string}
        name={asset?.name ?? 'Bien immobilier'}
        addressZip={p.address_zip ?? null}
        addressCity={p.address_city ?? null}
        fiscalRegime={p.fiscal_regime ?? null}
        purchasePrice={p.purchase_price ?? null}
        purchaseFees={p.purchase_fees ?? null}
        worksAmount={p.works_amount ?? null}
        currentValue={asset?.current_value ?? null}
        acquisitionDate={asset?.acquisition_date ?? null}
        lots={(p.lots ?? []).map((l: { status: string; rent_amount: number | null }) => ({
          status: l.status, rent_amount: l.rent_amount,
        }))}
        kpis={sim?.simulation.kpis ?? null}
        capitalRemaining={sim?.capitalRemaining ?? 0}
        incompleteData={sim?.simulation.incompleteData ?? false}
      />
    )
  }

  // ── Coordonnees geocodees (DB) ──────────────────────────────────────────
  const coords: Record<string, { lat: number; lng: number } | null> = {}
  for (const p of (properties ?? [])) {
    coords[p.id as string] = (p.latitude != null && p.longitude != null)
      ? { lat: p.latitude, lng: p.longitude }
      : null
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Immobilier physique"
        subtitle={
          properties?.length
            ? `${properties.length} bien${properties.length > 1 ? 's' : ''} au portefeuille`
            : undefined
        }
        action={<ImmobilierActions />}
      />

      {!properties?.length ? (
        <EmptyState
          icon={Building2}
          title="Aucun bien immobilier"
          description="Ajoutez vos biens immobiliers pour suivre leur valorisation, rendement et cash-flow."
          action={<ImmobilierActions />}
          ariaPrompt="Je n'ai pas encore de bien immobilier. Simule l'impact d'un premier achat locatif à 200 000 € sur ma trajectoire d'indépendance financière."
        />
      ) : (
        <>
          {estimatedCount > 0 && (
            <div className="mb-4">
              <ChargesWarningBanner
                estimated
                message={`Charges estimées sur ${estimatedCount} bien${estimatedCount > 1 ? 's' : ''} — rendement à ±10 %. Renseignez la taxe foncière, l'assurance PNO et l'entretien réels pour fiabiliser la projection.`}
              />
            </div>
          )}

          {showLmpAlert && (
            <div className="mb-4 card border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
              <div className="text-sm flex-1">
                <p className="font-medium text-primary">Vous devriez basculer en LMP</p>
                <p className="text-secondary mt-1">{lmpStatus.recommendation}</p>
                <p className="text-xs text-muted mt-2">
                  Le statut LMP change votre fiscalité : déficit imputable sans plafond
                  sur le revenu global, mais cotisations SSI obligatoires (~35 % du résultat).
                </p>
              </div>
            </div>
          )}

          <PortfolioKpis summary={portfolioSummary} />

          <PortfolioView
            summary={portfolioSummary}
            cardsByPropertyId={cardsByPropertyId}
            coords={coords}
          />
        </>
      )}
    </div>
  )
}
