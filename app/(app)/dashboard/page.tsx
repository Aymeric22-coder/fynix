import { Metadata } from 'next'
import { createServerClient }    from '@/lib/supabase/server'
import { KpiGrid }               from '@/components/dashboard/kpi-grid'
import { AlertsPanel }           from '@/components/dashboard/alerts-panel'
import { TopAssetsList }         from '@/components/dashboard/top-assets-list'
// V2.1 — PatrimonyAreaChart supprime (doublon avec PatrimoineEvolutionChart).
// V1.4 — Le pipeline unifié remplace le bloc inline 207-326 historique.
// `loadDashboardInputs` charge en parallèle tout ce dont la page a besoin
// (assets / debts / snapshots / portfolio / immo / transactions) ;
// `computeDashboardData(inputs)` applique les formules corrigées (P0.2/4/6/3).
import {
  loadDashboardInputs, computeDashboardData,
} from '@/lib/analyse/dashboard-pipeline'
import { getPatrimoineComplet }  from '@/lib/analyse/aggregateur'
import { FIREProgressHero, type FireHeroData } from '@/components/dashboard/fire-progress-hero'
import { FiscalKpiBanner } from '@/components/dashboard/fiscal-kpi-banner'
import { TropheesCard } from '@/components/dashboard/trophees-card'
import {
  CalendrierFiscal,
  type EvenementFiscalSerialisable,
} from '@/components/dashboard/calendrier-fiscal'
import { enrichJalonsAvecHistorique } from '@/lib/analyse/jalonsHistorique'
import { getEvenementsFiscaux } from '@/lib/fiscal/calendrier'
import type { JalonFIRE } from '@/types/analyse'
import { ActionsDuMois } from '@/components/dashboard/actions-du-mois'
import { DashboardEmptyState } from '@/components/dashboard/empty-state'
import { PatrimoineEvolutionChart } from '@/components/dashboard/patrimoine-evolution-chart'
import {
  RealEstateAlertsPanel,
  type PropertyDriftSummary,
} from '@/components/dashboard/real-estate-alerts-panel'
// V2.1 — `RealEstatePortfolioBlock` (4 KPIs) remplacé par `ImmoSummaryCompact` (1 ligne).
// Le composant complet reste dans le repo (peut servir ailleurs), simplement plus consommé ici.
import { ImmoSummaryCompact } from '@/components/dashboard/immo-summary-compact'
import { genererActionsMensuelles } from '@/lib/analyse/recoMensuelles'
import { calculerOpportunitesFiscales } from '@/lib/analyse/optimiseurFiscal'
import { formatCurrency } from '@/lib/utils/format'
// V2.1 — ConfidenceBadge retire du Dashboard (wrapper Evolution supprime ; composant conserve pour /immobilier/[id]).

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── V1.4 — Pipeline Dashboard unifié ────────────────────────────────
  // `loadDashboardInputs` charge en parallèle assets / debts / snapshots /
  // portfolio (buildPortfolioFromDb) / immo (computeRealEstatePortfolio) /
  // transactions + positions méta (pour TWR). Une seule passe Supabase,
  // tout ce dont la page a besoin pour les KPIs et le récap portefeuille.
  const inputs        = await loadDashboardInputs(supabase, user!.id)
  const dashboardData = computeDashboardData(inputs)

  // Aliases conservant le nommage du JSX existant (RealEstatePortfolioBlock,
  // récap portefeuille, etc.) → diff minimal sur le rendu.
  const assets           = inputs.assets
  // V2.1 — `snapshots` n'est plus consommé sur la page (wrapper Évolution supprimé).
  const portfolio        = inputs.realEstatePortfolio
  const portfolioSummary = inputs.portfolioSummary

  // ── Snapshot patrimoine complet (pour le FIRE Progress Hero) ─────────────
  // Inclut projectionFIRESnapshot, revenu passif actuel, etc. Heavy call mais
  // sert exclusivement au Hero — peut être déplacé si jamais plusieurs Heroes
  // sont rajoutés en haut du dashboard.
  const patrimoineComplet = await getPatrimoineComplet(user!.id)

  // ── Actions du mois (recoMensuelles) ─────────────────────────────────────
  // Pour la règle "DCA en retard", on charge la date de la position
  // ajoutée/modifiée la plus récemment. Si pas de position, la règle est skip.
  const { data: lastPosRow } = await supabase
    .from('positions')
    .select('acquisition_date')
    .eq('user_id', user!.id)
    .not('acquisition_date', 'is', null)
    .order('acquisition_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastPositionAddedAt = lastPosRow?.acquisition_date ?? null
  // Sprint 1 — I3 : ActionsDuMois inclut les top opportunites fiscales.
  const opportunitesFiscales = calculerOpportunitesFiscales({ patrimoine: patrimoineComplet }).opportunites

  // ── Jalons patrimoniaux historiques (carte « Mes trophées ») ─────────────
  // On charge l'historique complet pour identifier la 1re date de franchissement
  // de chaque seuil. Les wealth_snapshots restent bornés par utilisateur (1/jour
  // max via snapshotDebounce) donc le coût est borné dans le temps.
  const { data: allWealthSnaps } = await supabase
    .from('wealth_snapshots')
    .select('snapshot_date,patrimoine_net')
    .eq('user_id', user!.id)
    .order('snapshot_date', { ascending: true })
  const snapshotsForJalons = (allWealthSnaps ?? []).map((s) => ({
    snapshot_date: s.snapshot_date as string,
    patrimoine_net: Number(s.patrimoine_net ?? 0),
  }))
  const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000]
  const baseJalons: JalonFIRE[] = MILESTONES.map((seuil) => ({
    age:    0,
    label:  `${(seuil / 1000).toFixed(0)} k€`,
    type:   'milestone' as const,
    valeur: seuil,
  }))
  const jalonsEnrichis = enrichJalonsAvecHistorique(baseJalons, snapshotsForJalons)

  // ── Calendrier fiscal personnalisé ───────────────────────────────────────
  // Dates d'ouverture PEA / AV : on prend la `created_at` de la première
  // enveloppe correspondante (proxy raisonnable, à défaut de date saisie).
  const { data: envelopesRows } = await supabase
    .from('financial_envelopes')
    .select('envelope_type, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: true })
  const peaOuverture = envelopesRows?.find((e) => e.envelope_type === 'pea')?.created_at ?? null
  const avOuverture  = envelopesRows?.find((e) => e.envelope_type === 'assurance_vie')?.created_at ?? null

  // Solde Livret A (somme balances des comptes de type livret_a)
  const livretASolde = patrimoineComplet.comptes
    .filter((c) => c.type === 'livret_a')
    .reduce((s, c) => s + (c.solde ?? 0), 0)

  // Régimes fiscaux distincts présents dans les biens (skip null)
  const regimesImmoSet = new Set<string>()
  for (const b of patrimoineComplet.biens) {
    if (b.fiscal_regime) regimesImmoSet.add(b.fiscal_regime)
  }

  // Présence d'une résidence secondaire (type === 'Résidence secondaire' / proxy)
  const hasResidenceSecondaire = patrimoineComplet.biens.some(
    (b) => (b.type ?? '').toLowerCase().includes('secondaire'),
  )

  const evenementsFiscauxRaw = getEvenementsFiscaux({
    patrimoineNet:          patrimoineComplet.totalNet,
    tmiPct:                 patrimoineComplet.fireInputs.tmi_rate,
    enveloppes:             patrimoineComplet.fireInputs.enveloppes ?? [],
    regimesImmo:            Array.from(regimesImmoSet),
    nbBiensImmo:            patrimoineComplet.biens.length,
    hasResidenceSecondaire,
    peaOuvertureDate:       peaOuverture,
    avOuvertureDate:        avOuverture,
    livretASolde,
    now:                    new Date(),
  })
  // Sérialise Date → ISO string pour traverser la frontière Server → Client.
  const evenementsFiscaux: EvenementFiscalSerialisable[] = evenementsFiscauxRaw.map((e) => ({
    ...e,
    date: e.date.toISOString(),
  }))

  const actionsDuMois = genererActionsMensuelles(patrimoineComplet, {
    lastPositionAddedAt,
    opportunitesFiscales,
  })
  const proj = patrimoineComplet.projectionFIRESnapshot
  const fireHeroData: FireHeroData = {
    profileComplete: proj !== null,
    patrimoine_net_actuel:        patrimoineComplet.totalNet,
    patrimoine_fire_cible:        proj?.patrimoine_fire_cible ?? 0,
    age_actuel:                   patrimoineComplet.fireInputs.age,
    age_fire_cible:               patrimoineComplet.fireInputs.age_cible,
    age_fire_projete:             proj?.age_fire_projete ?? null,
    age_fire_optimiste:           proj?.age_fire_optimiste ?? null,
    age_fire_median:              proj?.age_fire_median ?? null,
    age_fire_pessimiste:          proj?.age_fire_pessimiste ?? null,
    rendement_central_pct:        proj?.rendement_central_pct ?? 7,
    epargne_mensuelle_actuelle:   patrimoineComplet.fireInputs.epargne_mensuelle,
    epargne_mensuelle_necessaire: proj?.epargne_mensuelle_necessaire ?? null,
    revenu_passif_actuel:         patrimoineComplet.revenuPassifActuel,
    // QW9 — Cible AJUSTÉE composition foyer (cohérence avec patrimoine_fire_cible
    // qui est calculé sur la même valeur dans computeProjectionSnapshot).
    revenu_passif_cible:          patrimoineComplet.fireInputs.revenu_passif_cible_ajuste,
    // QW9-bis — Détail de l'ajustement foyer (déjà calculé par loadProfile,
    // source unique). Si !hasAdjustment, on passe null pour que le composant
    // CibleFoyer ne s'affiche pas du tout.
    cibleFoyerDetail:             patrimoineComplet.fireInputs.cibleFoyerDetail.hasAdjustment
                                    ? patrimoineComplet.fireInputs.cibleFoyerDetail
                                    : null,
  }

  // ── V1.4 — Tous les calculs viennent de `dashboardData` (pipeline unifié) ──
  // BUGs corrigés : BUG-1 (brut MV strict), BUG-2 (TWR + croissance séparés),
  // BUG-3 (label CF immo explicite), BUG-6 (taxonomie d'allocation unifiée).
  const kpis      = dashboardData.kpis
  const alerts    = dashboardData.alerts
  const topAssets = dashboardData.topAssets
  const driftSummaries = dashboardData.realEstateDriftSummaries
  // V2.1 — `confScore` n'est plus consommé (wrapper Évolution + ConfidenceBadge supprimés).

  // Empty state : aucun actif renseigne (assets + positions + biens immo).
  const isEmpty =
    assets.length === 0 &&
    inputs.portfolioPositions.length === 0 &&
    portfolio.properties.length === 0

  return (
    <div className="space-y-8">
      {/* FIRE Progress Hero — toujours en premier (Sprint 1) */}
      <FIREProgressHero data={fireHeroData} />

      {isEmpty ? (
        <DashboardEmptyState />
      ) : (
        <>
      {/* KPI fiscal — opportunités chiffrées (lien vers /analyse?tab=optimiser) */}
      <FiscalKpiBanner opportunites={opportunitesFiscales} />

      {/* Actions de ce mois — recoMensuelles (Sprint 2) */}
      <ActionsDuMois actions={actionsDuMois} />

      {/* Évolution patrimoine — wealth_snapshots (Sprint 2) */}
      <PatrimoineEvolutionChart cibleFire={fireHeroData.patrimoine_fire_cible || null} />

      {/* Jalons patrimoniaux franchis */}
      <TropheesCard jalons={jalonsEnrichis} />

      {/* Calendrier fiscal personnalisé (12 prochains mois) */}
      <CalendrierFiscal evenements={evenementsFiscaux} />

      {/* Alertes */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* Alertes drift immobilier (Phase 2) — cast safe : driftAlerts est typé
          `unknown[]` côté pipeline (pour éviter le coupling avec lib/real-estate).
          Côté UI on sait que ce sont des `DriftAlert[]` produits par
          `computeRealEstatePortfolio`, et `RealEstateAlertsPanel` les valide. */}
      {driftSummaries.length > 0 && (
        <RealEstateAlertsPanel summaries={driftSummaries as PropertyDriftSummary[]} />
      )}

      {/* KPIs (V1.4 — Option B : 4 cartes dont widget Performance composite) */}
      <KpiGrid
        kpis={kpis}
        unvaluedPositionsCount={dashboardData.unvaluedPositionsCount}
        unvaluedPositionsLabel={dashboardData.unvaluedPositionsLabel}
      />

      {/* V2.1 — Résumé immobilier compact (1 ligne, lien vers /immobilier) */}
      {(() => {
        const reAssets = assets.filter((a) => a.asset_type === 'real_estate')
        const totalCurrentValue    = reAssets.reduce((s, a) => s + (a.current_value as number | null ?? 0), 0)
        const totalAcquisitionCost = reAssets.reduce((s, a) => s + (a.acquisition_price as number | null ?? 0), 0)
        return (
          <ImmoSummaryCompact
            propertyCount={portfolio.properties.length}
            totalCurrentValue={totalCurrentValue}
            totalAcquisitionCost={totalAcquisitionCost}
            totalCapitalRemaining={portfolio.totalCapitalRemaining}
            totalMonthlyCashFlow={portfolio.totalMonthlyCFYear1}
          />
        )
      })()}

      {/* Récap Portefeuille (si au moins une position) */}
      {portfolioSummary.positionsCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Valeur portefeuille',
              value: formatCurrency(portfolioSummary.totalMarketValue, 'EUR', { compact: true }),
              sub:   `${portfolioSummary.positionsCount} position(s) · ${portfolioSummary.valuedPositionsCount} valorisée(s)`,
              accent: false,
            },
            {
              label: 'Capital investi',
              value: formatCurrency(portfolioSummary.totalCostBasis, 'EUR', { compact: true }),
              sub:   'cost basis cumulé',
              accent: false,
            },
            {
              // Audit UX — empty fallback explicite "Pas encore valorise"
              // au lieu d'un em-dash cryptique. Sub guide vers l'action
              // (refresh) plutot qu'une formule passive "en attente".
              label: 'Plus-value latente',
              value: portfolioSummary.totalUnrealizedPnL !== null
                ? formatCurrency(portfolioSummary.totalUnrealizedPnL, 'EUR', { compact: true, sign: true })
                : 'Pas encore valorisé',
              sub: portfolioSummary.totalUnrealizedPnLPct !== null
                ? `${portfolioSummary.totalUnrealizedPnLPct >= 0 ? '+' : ''}${portfolioSummary.totalUnrealizedPnLPct.toFixed(2)} %`
                : 'Actualise les prix depuis /analyse',
              accent: (portfolioSummary.totalUnrealizedPnL ?? 0) >= 0
                      && portfolioSummary.totalUnrealizedPnL !== null,
            },
            {
              label: 'Fraîcheur prix',
              value: `${Math.round(portfolioSummary.freshnessRatio * 100)} %`,
              sub:   '< 24 h',
              accent: portfolioSummary.freshnessRatio >= 0.8,
            },
          ].map((k) => (
            <div key={k.label} className={`card p-4 ${k.accent ? 'border-accent/20' : ''}`}>
              <p className="text-xs text-secondary uppercase tracking-wider mb-2">{k.label}</p>
              <p className={`text-lg font-semibold financial-value ${k.accent ? 'text-accent' : 'text-primary'}`}>
                {k.value}
              </p>
              <p className="text-xs text-muted mt-1">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* V2.1 — Wrapper Card Évolution + PatrimonyAreaChart supprimés.
          La courbe d'évolution est désormais rendue UNIQUEMENT par
          `PatrimoineEvolutionChart` (plus haut, 5 séries + ligne FIRE +
          tooltip détaillé). Le ConfidenceBadge est retiré du Dashboard
          (sera réintégré en V2.2 dans la zone KPIs si décision produit). */}

      {/* Top actifs */}
      {topAssets.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-medium text-primary mb-6">
            Top {topAssets.length} actifs
          </h2>
          <TopAssetsList assets={topAssets} />
        </div>
      )}
        </>
      )}
    </div>
  )
}
