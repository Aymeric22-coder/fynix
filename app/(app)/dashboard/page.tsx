import { Metadata } from 'next'
import { createServerClient }    from '@/lib/supabase/server'
// V2.2 — KpiGrid + AlertsPanel sont desormais consommes via ZonePilotage.
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
// V2.2 — FiscalKpiBanner + CalendrierFiscal consommés via ZoneFiscaliteToggle.
import { TropheesCard } from '@/components/dashboard/trophees-card'
import type { EvenementFiscalSerialisable } from '@/components/dashboard/calendrier-fiscal'
import { enrichJalonsAvecHistorique } from '@/lib/analyse/jalonsHistorique'
import { getEvenementsFiscaux } from '@/lib/fiscal/calendrier'
import type { JalonFIRE } from '@/types/analyse'
// V2.2 — ActionsDuMois consommé via ZonePilotage + ZoneFiscaliteToggle (avec prop filter).
import { DashboardEmptyState } from '@/components/dashboard/empty-state'
import { PatrimoineEvolutionChart } from '@/components/dashboard/patrimoine-evolution-chart'
// V2.2 — RealEstateAlertsPanel consommé via ZonePilotage. Type conservé pour le cast.
import type { PropertyDriftSummary } from '@/components/dashboard/real-estate-alerts-panel'
import { ZonePilotage } from '@/components/dashboard/zone-pilotage'
import { ZoneFiscaliteToggle } from '@/components/dashboard/zone-fiscalite-toggle'
// V2.4 / V2.4-BIS — Z8.5 : Meilleur / Pire investissement par classe d'actif.
// V2.4-BIS : rendement instantané (plus-value latente / rendement locatif / taux), sans seuil 90 j.
import { ZoneChampionsCasseroles } from '@/components/dashboard/zone-champions-casseroles'
// V2.1 — `RealEstatePortfolioBlock` (4 KPIs) remplacé par `ImmoSummaryCompact` (1 ligne).
// Le composant complet reste dans le repo (peut servir ailleurs), simplement plus consommé ici.
import { ImmoSummaryCompact } from '@/components/dashboard/immo-summary-compact'
import { PortefeuilleSummaryCompact } from '@/components/dashboard/portefeuille-summary-compact'
import { CashSummaryCompact } from '@/components/dashboard/cash-summary-compact'
import { genererActionsMensuelles } from '@/lib/analyse/recoMensuelles'
import { calculerOpportunitesFiscales } from '@/lib/analyse/optimiseurFiscal'
// V2.1 — formatCurrency n'est plus consommé sur la page (bloc Récap inline supprimé).
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
      {/* V2.2 — Cascade narrative Z1 → Z9.
            Z1 : FIREProgressHero (rendu plus haut, hors du gate isEmpty)
            Z2 : Évolution patrimoine (la dynamique, "comment")
            Z3 : Jalons franchis (la motivation)
            Z4 : Pilotage (KPIs + alertes + actions non-fiscales)
            Z5 : Résumé Immobilier
            Z6 : Résumé Portefeuille
            Z7 : Résumé Cash
            Z8 : Top 5 actifs
            Z9 : Fiscalité (toggle, masquée par défaut) */}

      {/* Z2 — Évolution patrimoine */}
      <PatrimoineEvolutionChart cibleFire={fireHeroData.patrimoine_fire_cible || null} />

      {/* Z3 — Jalons franchis */}
      <TropheesCard jalons={jalonsEnrichis} />

      {/* Z4 — Pilotage : KPIs + Alertes (sur-exposition, drift immo) + Actions non-fiscales */}
      <ZonePilotage
        kpis={kpis}
        unvaluedPositionsCount={dashboardData.unvaluedPositionsCount}
        unvaluedPositionsLabel={dashboardData.unvaluedPositionsLabel}
        alerts={alerts}
        driftSummaries={driftSummaries as PropertyDriftSummary[]}
        actions={actionsDuMois}
      />

      {/* Z5 — Résumé immobilier compact */}
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

      {/* Z6 — Résumé portefeuille compact */}
      <PortefeuilleSummaryCompact
        positionsCount={portfolioSummary.positionsCount}
        valuedPositionsCount={portfolioSummary.valuedPositionsCount}
        totalMarketValue={portfolioSummary.totalMarketValue}
        totalUnrealizedPnL={portfolioSummary.totalUnrealizedPnL}
        totalUnrealizedPnLPct={portfolioSummary.totalUnrealizedPnLPct}
        freshnessRatio={portfolioSummary.freshnessRatio}
      />

      {/* Z7 — Résumé cash compact */}
      <CashSummaryCompact
        totalEur={dashboardData.cashSummary.totalEur}
        accountsCount={dashboardData.cashSummary.accountsCount}
      />

      {/* Z8 — Top 5 actifs (atomique en V2.2 ; consolidation par enveloppe en V2.3) */}
      {topAssets.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-medium text-primary mb-6">
            Top {topAssets.length} actifs
          </h2>
          <TopAssetsList assets={topAssets} />
        </div>
      )}

      {/* Z8.5 — Meilleur / Pire investissement par catégorie (V2.4 / V2.4-BIS).
            V2.4-BIS : rendement instantané, sans seuil temporel.
            Auto-masque si aucun bucket n'a de candidat éligible. */}
      <ZoneChampionsCasseroles rankings={dashboardData.investmentRankings} />

      {/* Z9 — Fiscalité (toggle persistant en localStorage, masquée par défaut) */}
      <ZoneFiscaliteToggle
        opportunitesFiscales={opportunitesFiscales}
        evenementsFiscaux={evenementsFiscaux}
        actions={actionsDuMois}
      />
        </>
      )}
    </div>
  )
}
