/**
 * Mappe les donnees brutes (`AriaRawData`) vers `AriaLiveContext`,
 * la forme compacte injectee dans le system prompt de Claude.
 *
 * Aucune logique metier nouvelle : on consomme `PatrimoineComplet`
 * (issu de `lib/analyse/aggregateur.ts`) et on derive uniquement :
 *   - les variations de patrimoine (depuis `wealth_snapshots`)
 *   - les mois de precaution (meme formule que `scores.ts > calculerSolidite`,
 *     volontairement dupliquee car 3 lignes pures sans externalite)
 *   - la transformation `Recommandation` -> `AriaAlerte`
 *
 * Toute autre valeur est lue directement de `PatrimoineComplet`.
 */

import type {
  PatrimoineComplet, BienImmo, EnrichedPosition, CompteCash,
  ClasseAlloc, SecteurAlloc, GeoAlloc, Recommandation,
  Score, ScoresComplets, ProjectionFIRESnapshot,
} from '@/types/analyse'
import type {
  AriaActionRecente, AriaActivityRow, AriaAlerte, AriaAlerteType,
  AriaBien, AriaCash, AriaCompteCash, AriaFire, AriaImmo, AriaLiveContext,
  AriaPatrimoine, AriaPortfolio, AriaPosition, AriaRawData, AriaRepartitionLine,
  AriaScore, AriaScores, AriaUIContext, AriaUserProfile, AriaWealthSnapshotRow,
} from './types'

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function pctChange(current: number, past: number): number | null {
  if (!isFinite(current) || !isFinite(past) || past === 0) return null
  return ((current - past) / Math.abs(past)) * 100
}

/**
 * Trouve le snapshot le plus proche d'une date cible (J - N jours).
 * Les snapshots arrivent tries du plus recent au plus ancien.
 */
function snapshotAroundDaysAgo(
  snapshots: AriaWealthSnapshotRow[],
  daysAgo: number,
  refDate: Date,
): AriaWealthSnapshotRow | null {
  if (snapshots.length === 0) return null
  const targetMs = refDate.getTime() - daysAgo * 86_400_000
  let best: AriaWealthSnapshotRow | null = null
  let bestDelta = Infinity
  for (const snap of snapshots) {
    const snapMs = new Date(snap.snapshot_date).getTime()
    if (!isFinite(snapMs)) continue
    const delta = Math.abs(snapMs - targetMs)
    if (delta < bestDelta) {
      bestDelta = delta
      best = snap
    }
  }
  // Si le meilleur snapshot est a plus de 14 jours du target, on
  // considere qu'on n'a pas la donnee (eviter les comparaisons absurdes).
  const maxAllowedDelta = 14 * 86_400_000
  return bestDelta <= maxAllowedDelta ? best : null
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Profil
// ─────────────────────────────────────────────────────────────────

function mapProfil(p: PatrimoineComplet): AriaUserProfile {
  return {
    prenom:                 p.prenom,
    age:                    p.fireInputs.age,
    age_fire_cible:         p.fireInputs.age_cible,
    type_investisseur:      p.profilType,
    tolerance_risque:       p.fireInputs.risk_score,
    revenu_passif_objectif: p.fireInputs.revenu_passif_cible,
    tmi_rate:               p.fireInputs.tmi_rate,
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Patrimoine
// ─────────────────────────────────────────────────────────────────

function mapPatrimoine(
  p: PatrimoineComplet,
  snapshots: AriaWealthSnapshotRow[],
  now: Date,
): AriaPatrimoine {
  const snap30 = snapshotAroundDaysAgo(snapshots, 30, now)
  const snap90 = snapshotAroundDaysAgo(snapshots, 90, now)
  return {
    brut:              p.totalBrut,
    net:               p.totalNet,
    dettes:            p.totalDettes,
    evolution_30j_pct: snap30 ? pctChange(p.totalNet, snap30.patrimoine_net) : null,
    evolution_90j_pct: snap90 ? pctChange(p.totalNet, snap90.patrimoine_net) : null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Portefeuille
// ─────────────────────────────────────────────────────────────────

function mapPosition(pos: EnrichedPosition): AriaPosition {
  return {
    ticker:          pos.isin,
    nom:             pos.name,
    classe:          pos.asset_type,
    quantite:        pos.quantity,
    pru:             pos.pru,
    valeur_actuelle: pos.current_value,
    pv_latente:      pos.gain_loss,
    pv_latente_pct:  pos.gain_loss_pct,
    devise:          pos.currency,
  }
}

function mapRepartitionClasses(rep: ClasseAlloc[]): AriaRepartitionLine[] {
  return rep.map((r) => ({ label: r.label, pourcentage: r.pourcentage }))
}

function mapRepartitionSecteurs(rep: SecteurAlloc[]): AriaRepartitionLine[] {
  return rep.map((r) => ({ label: r.secteur, pourcentage: r.pourcentage }))
}

function mapRepartitionGeo(rep: GeoAlloc[]): AriaRepartitionLine[] {
  return rep.map((r) => ({ label: r.zone, pourcentage: r.pourcentage }))
}

function mapPortfolio(p: PatrimoineComplet): AriaPortfolio {
  const positions = [...p.positions].sort((a, b) => b.current_value - a.current_value)
  const top3 = positions.slice(0, 3).map(mapPosition)
  const pvLatente = positions.reduce((s, pos) => s + pos.gain_loss, 0)
  return {
    valeur_totale:        p.totalPortefeuille,
    pv_latente_totale:    pvLatente,
    nb_positions:         positions.length,
    top_3_par_valeur:     top3,
    repartition_classes:  mapRepartitionClasses(p.repartitionClasses),
    repartition_secteurs: mapRepartitionSecteurs(p.repartitionSectorielle).slice(0, 8),
    repartition_geo:      mapRepartitionGeo(p.repartitionGeo).slice(0, 8),
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Immobilier
// ─────────────────────────────────────────────────────────────────

function mapBien(b: BienImmo): AriaBien {
  return {
    id:                 b.id,
    nom:                b.nom,
    ville:              b.ville,
    type:               b.type,
    valeur:             b.valeur,
    equity:             b.equity,
    loyer_mensuel:      b.loyer_mensuel,
    cashflow_mensuel:   b.cashflow_mensuel,
    rendement_brut_pct: b.rendement_brut,
    rendement_net_pct:  b.rendement_net,
    ltv_pct:            b.ltv,
    // Le type definit 'Sans crédit' avec accent ; on retient la version sans accent
    // pour l'API ARIA (plus simple a manipuler dans les prompts) mais on accepte les
    // deux orthographes en entree.
    niveau_levier:      (b.niveau_levier === 'Sans crédit' ? 'Sans credit' : b.niveau_levier) as AriaBien['niveau_levier'],
  }
}

function mapImmo(p: PatrimoineComplet): AriaImmo {
  const biens = p.biens.map(mapBien)
  const loyersAnnuelsTotaux = p.biens.reduce((s, b) => s + b.loyer_mensuel * 12, 0)
  return {
    nb_biens:                biens.length,
    valeur_brute_totale:     p.totalImmo,
    credit_total_restant:    p.totalDettes,
    equity_totale:           p.totalImmoEquity,
    loyers_annuels_totaux:   loyersAnnuelsTotaux,
    rendement_net_moyen_pct: p.rendementNetImmoMoyen,
    revenu_passif_mensuel:   p.revenuPassifImmo,
    biens,
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Cash
// ─────────────────────────────────────────────────────────────────

/**
 * Calcule les mois de precaution couverts par le cash. Meme formule
 * que `lib/analyse/scores.ts > calculerSolidite (c)` : charges
 * mensuelles personnelles + effort immo net mensuel s'il est negatif.
 *
 * Why: cette grandeur n'est pas exposee separement par PatrimoineComplet ;
 * on l'extrait ici en repliquant la formule canonique (3 lignes pures,
 * sans dependance externe). Si le calcul change dans scores.ts il
 * faudra synchroniser ici.
 */
function moisPrecaution(p: PatrimoineComplet): number | null {
  const effortImmoMensuelNet = p.revenuPassifImmo < 0 ? -p.revenuPassifImmo : 0
  const chargesACouvrir = p.fireInputs.charges_mensuelles + effortImmoMensuelNet
  if (chargesACouvrir <= 0) return null
  return p.totalCash / chargesACouvrir
}

function mapCompteCash(c: CompteCash): AriaCompteCash {
  return { id: c.id, nom: c.nom, type: c.type, solde: c.solde, devise: c.devise }
}

function mapCash(p: PatrimoineComplet): AriaCash {
  const mois = moisPrecaution(p)
  return {
    total:           p.totalCash,
    mois_precaution: mois,
    cash_excessif:   mois !== null && mois > 12,
    comptes:         p.comptes.map(mapCompteCash),
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : FIRE
// ─────────────────────────────────────────────────────────────────

function mapFire(p: PatrimoineComplet): AriaFire {
  const snap: ProjectionFIRESnapshot | null = p.projectionFIRESnapshot
  const ageActuel = p.fireInputs.age
  const ageFireMedian = snap?.age_fire_median ?? null
  const cible = snap?.patrimoine_fire_cible ?? null
  const progressionPct = cible !== null && cible > 0 ? (p.totalNet / cible) * 100 : null
  const ecart = cible !== null ? cible - p.totalNet : null
  const annees = ageFireMedian !== null && ageActuel !== null ? Math.max(0, ageFireMedian - ageActuel) : null
  return {
    cible_patrimoine:     cible,
    progression_pct:      progressionPct,
    age_fire_estime:      ageFireMedian,
    age_fire_optimiste:   snap?.age_fire_optimiste ?? null,
    age_fire_pessimiste:  snap?.age_fire_pessimiste ?? null,
    annees_restantes:     annees,
    revenu_passif_actuel: p.revenuPassifActuel,
    // SWR explicite non expose dans le snapshot ; reste null (le prompt sait
    // que la regle 25x = SWR 4 % par defaut quand absent).
    taux_retrait_pct:     null,
    ecart_objectif_eur:   ecart,
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Scores
// ─────────────────────────────────────────────────────────────────

function mapScore(s: Score): AriaScore {
  return { value: s.value, niveau: s.niveau, label: s.label }
}

function mapScores(scores: ScoresComplets): AriaScores {
  return {
    diversification:    mapScore(scores.diversification),
    coherence_profil:   mapScore(scores.coherence_profil),
    progression_fire:   mapScore(scores.progression_fire),
    solidite:           mapScore(scores.solidite),
    efficience_fiscale: mapScore(scores.efficience_fiscale),
  }
}

// ─────────────────────────────────────────────────────────────────
// Mapping : Alertes (a partir des recommandations + scores critiques)
// ─────────────────────────────────────────────────────────────────

function recoToAlerte(r: Recommandation): AriaAlerte {
  const type: AriaAlerteType = r.priorite === 'haute'
    ? 'critical'
    : r.priorite === 'moyenne'
      ? 'warning'
      : 'info'
  return {
    type,
    categorie:       r.categorie,
    message:         r.titre,
    action_suggeree: r.action,
  }
}

function mapAlertes(p: PatrimoineComplet): AriaAlerte[] {
  const fromRecos = p.recommandations.map(recoToAlerte)

  // Alertes additionnelles derivees des scores critiques (rouge).
  const scoresRouges: AriaAlerte[] = []
  const scoreEntries = Object.entries(p.scores) as Array<[string, Score]>
  for (const [key, score] of scoreEntries) {
    if (score.niveau === 'rouge' && score.value !== null && score.value < 30) {
      scoresRouges.push({
        type:            'critical',
        categorie:       key,
        message:         `Score ${key} critique : ${score.label}`,
        action_suggeree: score.explanation?.action ?? null,
      })
    }
  }

  return [...scoresRouges, ...fromRecos]
}

// ─────────────────────────────────────────────────────────────────
// Mapping : actions recentes
// ─────────────────────────────────────────────────────────────────

function mapActions(activites: AriaActivityRow[]): AriaActionRecente[] {
  return activites.map((a) => ({
    date:        a.created_at,
    type:        a.type,
    description: a.description,
  }))
}

// ─────────────────────────────────────────────────────────────────
// Mapping : UI context
// ─────────────────────────────────────────────────────────────────

export interface UIInput {
  section?:                 string | null
  page_url?:                string | null
  derniere_action_chrono?:  string | null
}

function mapUI(ui: UIInput | null | undefined): AriaUIContext {
  return {
    section:                 ui?.section ?? null,
    page_url:                ui?.page_url ?? null,
    derniere_action_chrono:  ui?.derniere_action_chrono ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────
// Point d'entree principal
// ─────────────────────────────────────────────────────────────────

/**
 * Transforme `AriaRawData` + `UIInput` -> `AriaLiveContext` pret a
 * etre injecte dans le system prompt.
 *
 * Pure function : aucun I/O, deterministe pour des inputs donnes
 * (a l'exception de `generated_at` qui est `now()`).
 */
export function buildContextFromRaw(
  raw: AriaRawData,
  ui: UIInput | null | undefined,
  now: Date = new Date(),
): AriaLiveContext {
  const { patrimoine, snapshots, activites } = raw
  return {
    profil:           mapProfil(patrimoine),
    patrimoine:       mapPatrimoine(patrimoine, snapshots, now),
    portefeuille:     mapPortfolio(patrimoine),
    immo:             mapImmo(patrimoine),
    cash:             mapCash(patrimoine),
    fire:             mapFire(patrimoine),
    scores:           mapScores(patrimoine.scores),
    alertes:          mapAlertes(patrimoine),
    actions_recentes: mapActions(activites),
    conversations_passees: raw.conversations_passees ?? [],
    insights_persistants:  raw.insights_persistants  ?? [],
    ui:               mapUI(ui),
    generated_at:     now.toISOString(),
  }
}
