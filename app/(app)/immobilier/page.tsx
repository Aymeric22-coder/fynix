import { Metadata }     from 'next'
import Link             from 'next/link'
import { Building2, MapPin, TrendingUp, Banknote, AlertTriangle } from 'lucide-react'
import { createServerClient }            from '@/lib/supabase/server'
import { PageHeader }                    from '@/components/shared/page-header'
import { EmptyState }                    from '@/components/ui/empty-state'
import { Badge }                         from '@/components/ui/badge'
import { ImmobilierActions }             from '@/components/pages/immobilier-actions'
import { computeRealEstatePortfolio }    from '@/lib/real-estate/portfolio'
import { formatCurrency, formatPercent, ASSET_TYPE_LABELS } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Immobilier' }

export default async function ImmobilierPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Propriétés brutes pour l'affichage (adresse, surface, lots) ──────────
  const { data: properties } = await supabase
    .from('real_estate_properties')
    .select(`
      id, asset_id, property_type, address_city, address_zip, surface_m2,
      purchase_price, purchase_fees, works_amount, fiscal_regime,
      asset:assets!asset_id ( name, current_value, acquisition_price, status ),
      lots:real_estate_lots ( id, status, rent_amount, charges_amount )
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  // ── Simulations agrégées ─────────────────────────────────────────────────
  const portfolio = await computeRealEstatePortfolio(supabase, user!.id)

  // Index des résultats par propertyId pour lookup O(1)
  const simByProp = new Map(portfolio.properties.map((p) => [p.propertyId, p]))

  // ── Totaux ───────────────────────────────────────────────────────────────
  type AssetJoin = { name: string; current_value: number | null; acquisition_price: number | null; status: string }
  const getAsset = (raw: unknown): AssetJoin | null =>
    Array.isArray(raw) ? (raw[0] ?? null) : (raw as AssetJoin | null)

  const totalValue = (properties ?? []).reduce((s, p) => s + (getAsset(p.asset)?.current_value ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Immobilier physique"
        subtitle={
          properties?.length
            ? `${properties.length} bien${properties.length > 1 ? 's' : ''} · ${formatCurrency(totalValue, 'EUR', { compact: true })} · CF ${formatCurrency(portfolio.totalMonthlyCFYear1, 'EUR')}/mois`
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
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {properties.map((p) => {
            const asset       = getAsset(p.asset)
            const lots        = p.lots ?? []
            const rented      = lots.filter((l: { status: string }) => l.status === 'rented')
            const monthlyRent = rented.reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0)
            const acqCost     = (p.purchase_price ?? 0) + (p.purchase_fees ?? 0) + (p.works_amount ?? 0)
            const latentGain  = (asset?.current_value ?? 0) - acqCost
            const occupancy   = lots.length > 0 ? (rented.length / lots.length) * 100 : 0

            const sim         = simByProp.get(p.id)
            const simOk       = sim && !sim.simulation.incompleteData
            const kpis        = sim?.simulation.kpis

            return (
              <Link key={p.id} href={`/immobilier/${p.id}`} className="card p-5 hover:shadow-card-hover transition-shadow block">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-medium text-primary">{asset?.name}</h3>
                    {p.address_city && (
                      <p className="text-xs text-secondary mt-0.5 flex items-center gap-1">
                        <MapPin size={11} />
                        {p.address_zip} {p.address_city}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {sim?.simulation.incompleteData && (
                      <span title="Données de simulation incomplètes">
                        <AlertTriangle size={13} className="text-warning" />
                      </span>
                    )}
                    <Badge variant="muted">{ASSET_TYPE_LABELS['real_estate']}</Badge>
                  </div>
                </div>

                {/* Métriques — ligne 1 : données réelles */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-secondary">Valeur estimée</p>
                    <p className="text-sm font-medium financial-value text-primary mt-0.5">
                      {formatCurrency(asset?.current_value, 'EUR', { compact: true })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary">Prix de revient</p>
                    <p className="text-sm font-medium financial-value text-primary mt-0.5">
                      {acqCost > 0 ? formatCurrency(acqCost, 'EUR', { compact: true }) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary">PV latente</p>
                    <p className={`text-sm font-medium financial-value mt-0.5 ${latentGain >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
                    </p>
                  </div>
                </div>

                {/* Métriques — ligne 2 : simulation (si disponible) */}
                {simOk && kpis && (
                  <div className="grid grid-cols-3 gap-3 mb-3 pt-3 border-t border-border">
                    <div>
                      <p className="text-xs text-secondary flex items-center gap-1">
                        <Banknote size={10} />
                        CF mensuel
                      </p>
                      <p className={`text-sm font-medium financial-value mt-0.5 ${kpis.monthlyCashFlowYear1 >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {formatCurrency(kpis.monthlyCashFlowYear1, 'EUR')}
                      </p>
                      <p className="text-xs text-muted">après impôts Y1</p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary flex items-center gap-1">
                        <TrendingUp size={10} />
                        Rdt net-net
                      </p>
                      <p className={`text-sm font-medium financial-value mt-0.5 ${kpis.netNetYield > 0 ? 'text-accent' : 'text-secondary'}`}>
                        {kpis.netNetYield > 0 ? formatPercent(kpis.netNetYield) : '—'}
                      </p>
                      <p className="text-xs text-muted">brut {kpis.grossYieldOnPrice > 0 ? formatPercent(kpis.grossYieldOnPrice) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Remboursement</p>
                      <p className="text-sm font-medium financial-value text-primary mt-0.5">
                        {kpis.paybackYear !== null ? `An ${kpis.paybackYear}` : '—'}
                      </p>
                      <p className="text-xs text-muted">
                        {sim.capitalRemaining > 0
                          ? `CRD ${formatCurrency(sim.capitalRemaining, 'EUR', { compact: true })}`
                          : 'Achat cash'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Lots */}
                {lots.length > 0 && (
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-secondary">
                        {rented.length}/{lots.length} lots loués
                      </div>
                      <div className="h-1.5 w-20 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${occupancy}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-secondary">
                      {formatCurrency(monthlyRent, 'EUR')} / mois
                    </p>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
