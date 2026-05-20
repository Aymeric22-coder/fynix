import { Metadata }     from 'next'
import Link             from 'next/link'
import { Building2, MapPin, TrendingUp, Banknote, AlertTriangle, Wallet, Activity } from 'lucide-react'
import { createServerClient }            from '@/lib/supabase/server'
import { PageHeader }                    from '@/components/shared/page-header'
import { EmptyState }                    from '@/components/ui/empty-state'
import { Badge }                         from '@/components/ui/badge'
import { ChargesWarningBanner }          from '@/components/ui/charges-warning-banner'
import { ImmobilierActions }             from '@/components/pages/immobilier-actions'
import { ReventeButton }                 from '@/components/real-estate/revente-button'
import {
  mapFiscalRegimeToRevente,
  type TypeUsageBien,
} from '@/lib/real-estate/plusValue'
import { computeRealEstatePortfolio }    from '@/lib/real-estate/portfolio'
import { detectLmpStatus, sumMeubleeRevenues } from '@/lib/real-estate/fiscal/lmp-detector'
import { DeletePropertyButton } from '@/components/real-estate/delete-property-button'
import { formatCurrency, formatPercent, ASSET_TYPE_LABELS } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Immobilier' }

/** Déduit le type d'usage par défaut à partir du régime fiscal saisi.
 *  L'utilisateur peut surcharger dans le modal. */
function inferTypeUsage(fiscalRegime: string | null): TypeUsageBien {
  if (!fiscalRegime) return 'secondaire'
  // Tous les régimes connus de la table profiles sont locatifs.
  if (fiscalRegime.startsWith('lmnp_')
   || fiscalRegime.startsWith('lmp')
   || fiscalRegime.startsWith('foncier_')
   || fiscalRegime.startsWith('sci_')) return 'locatif'
  return 'secondaire'
}

export default async function ImmobilierPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Propriétés (adresse, surface, lots) ─────────────────────────────────
  const { data: properties } = await supabase
    .from('real_estate_properties')
    .select(`
      id, asset_id, property_type, address_city, address_zip, surface_m2,
      purchase_price, purchase_fees, works_amount, fiscal_regime,
      asset:assets!asset_id ( name, current_value, acquisition_price, acquisition_date, status ),
      lots:real_estate_lots ( id, status, rent_amount, charges_amount )
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  // ── Profil : revenus pro pour détection LMP ─────────────────────────────
  // Migration 036 : champ professional_income_eur. Fallback 0 si absent
  // (l'utilisateur n'a pas encore renseigné son profil).
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('professional_income_eur')
    .eq('id', user!.id)
    .maybeSingle()
  const professionalIncomeEur =
    (profileRow?.professional_income_eur as number | null | undefined) ?? 0

  // ── Détection LMNP → LMP (CGI art. 151 septies) ────────────────────────
  const meubleeRevenues = sumMeubleeRevenues(
    (properties ?? []).map((p) => ({
      fiscal_regime: p.fiscal_regime,
      // Recettes annuelles = somme des loyers des lots loués × 12.
      annualMeubleeRevenues: (p.lots ?? [])
        .filter((l: { status: string }) => l.status === 'rented')
        .reduce((s: number, l: { rent_amount: number | null }) => s + (l.rent_amount ?? 0), 0) * 12,
    })),
  )
  const lmpStatus = detectLmpStatus(meubleeRevenues, { professionalIncomeEur })
  // On affiche la bannière uniquement si le statut détecté est LMP
  // ET qu'au moins un bien est encore déclaré en LMNP (réel ou micro).
  const hasLmnpProperty = (properties ?? []).some(
    p => p.fiscal_regime === 'lmnp_reel' || p.fiscal_regime === 'lmnp_micro',
  )
  const showLmpAlert = lmpStatus.isLmp && hasLmnpProperty

  // ── Simulations agrégées (avec CRD analytique) ──────────────────────────
  const portfolio = await computeRealEstatePortfolio(supabase, user!.id)
  const simByProp = new Map(portfolio.properties.map((p) => [p.propertyId, p]))

  // ── Propriétés sans charges réelles saisies → banner global ─────────────
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

  // ── Helpers ──────────────────────────────────────────────────────────────
  type AssetJoin = { name: string; current_value: number | null; acquisition_price: number | null; acquisition_date: string | null; status: string }
  const getAsset = (raw: unknown): AssetJoin | null =>
    Array.isArray(raw) ? (raw[0] ?? null) : (raw as AssetJoin | null)

  // ── Totaux (header) ──────────────────────────────────────────────────────
  const totalGross = (properties ?? []).reduce(
    (s, p) => s + (getAsset(p.asset)?.current_value ?? 0),
    0,
  )
  const totalDebt = portfolio.totalCapitalRemaining
  const totalNet  = totalGross - totalDebt
  const totalCF   = portfolio.totalMonthlyCFYear1

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

          {/* ── KPIs globaux du portefeuille immobilier ──────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest">Patrimoine brut</p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(totalGross, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">{properties.length} bien{properties.length > 1 ? 's' : ''}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Dette immobilière</p>
              <p className={`text-xl font-semibold financial-value mt-2 ${totalDebt > 0 ? 'text-danger' : 'text-secondary'}`}>
                {totalDebt > 0 ? formatCurrency(totalDebt, 'EUR', { compact: true }) : '—'}
              </p>
              <p className="text-xs text-secondary mt-1">CRD cumulé</p>
            </div>
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <Wallet size={11} /> Patrimoine net
              </p>
              <p className="text-xl font-semibold financial-value text-accent mt-2">
                {formatCurrency(totalNet, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">brut − dette</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <Activity size={11} /> Cash-flow mensuel
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${totalCF >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(totalCF, 'EUR')}
              </p>
              <p className="text-xs text-secondary mt-1">après impôts Y1 cumulés</p>
            </div>
          </div>

          {/* ── Cartes biens ─────────────────────────────────────────────── */}
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
              const crd         = sim?.capitalRemaining ?? 0
              const netValue    = (asset?.current_value ?? 0) - crd

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
                      <DeletePropertyButton
                        propertyId={p.id}
                        propertyName={asset?.name ?? 'ce bien'}
                        variant="icon"
                      />
                    </div>
                  </div>

                  {/* Métriques — ligne 1 : valeur / CRD / valeur nette */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-secondary">Valeur</p>
                      <p className="text-sm font-medium financial-value text-primary mt-0.5">
                        {formatCurrency(asset?.current_value, 'EUR', { compact: true })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">CRD</p>
                      <p className={`text-sm font-medium financial-value mt-0.5 ${crd > 0 ? 'text-danger' : 'text-secondary'}`}>
                        {crd > 0 ? formatCurrency(crd, 'EUR', { compact: true }) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Valeur nette</p>
                      <p className="text-sm font-medium financial-value text-accent mt-0.5">
                        {formatCurrency(netValue, 'EUR', { compact: true })}
                      </p>
                    </div>
                  </div>

                  {/* Métriques — ligne 2 : cash-flow / rentabilité / plus-value */}
                  {simOk && kpis && (
                    <div className="grid grid-cols-3 gap-3 mb-3 pt-3 border-t border-border">
                      <div>
                        <p className="text-xs text-secondary flex items-center gap-1">
                          <Banknote size={10} />
                          Cash-flow
                        </p>
                        <p className={`text-sm font-medium financial-value mt-0.5 ${kpis.monthlyCashFlowYear1 >= 0 ? 'text-accent' : 'text-danger'}`}>
                          {formatCurrency(kpis.monthlyCashFlowYear1, 'EUR')}
                        </p>
                        <p className="text-xs text-muted">après impôts /mois</p>
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
                        <p className="text-xs text-secondary">PV latente</p>
                        <p className={`text-sm font-medium financial-value mt-0.5 ${latentGain >= 0 ? 'text-accent' : 'text-danger'}`}>
                          {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
                        </p>
                        <p className="text-xs text-muted">
                          {kpis.paybackYear !== null ? `Payback an ${kpis.paybackYear}` : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Lots / occupation */}
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

                  {/* Bouton « Simuler la revente » (sans déclencher la nav du Link) */}
                  {asset?.acquisition_date && (p.purchase_price ?? 0) > 0 && (
                    <div className="mt-4 pt-3 border-t border-border">
                      <ReventeButton
                        bien={{
                          id:               p.id,
                          nom:              asset.name ?? 'Bien immobilier',
                          prixAchat:        p.purchase_price ?? 0,
                          dateAchat:        asset.acquisition_date,
                          valeurActuelle:   asset.current_value,
                          typeUsage:        inferTypeUsage(p.fiscal_regime),
                          regimeFiscal:     mapFiscalRegimeToRevente(p.fiscal_regime),
                          fraisAcquisitionReels: p.purchase_fees > 0 ? p.purchase_fees : undefined,
                          travauxReels:          p.works_amount   > 0 ? p.works_amount   : undefined,
                          // CRD cumulé pré-calculé par `computeRealEstatePortfolio`
                          // (cache `debts.capital_remaining`). 0 si pas de crédit actif.
                          creditCapitalRestantDu: crd > 0 ? crd : undefined,
                        }}
                      />
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
