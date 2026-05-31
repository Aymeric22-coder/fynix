/**
 * CS4 — Boussole d'objectifs 4 axes : source unique de vérité.
 *
 * Remplace le mono-axe `priorite` (4 valeurs disjointes) par 4 axes
 * pondérés 0..100 captant la psyché multi-dimensionnelle d'un user.
 *
 * Pattern miroir des autres constants files (lifeEventsConstants,
 * enveloppesConstants, quizCatalog, cryptoConstants, chaptersConstants) :
 * source unique, helpers atomiques, garde-fou tests.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MÉCANIQUE DU BOOST (invariant critique de non-régression)
 * ─────────────────────────────────────────────────────────────────────
 *
 * Le boost est calculé sur axes CENTRÉS autour de 50 (= valeur neutre) :
 *   centered_i = (axe_i - 50) / 50    →    centered ∈ [-1, +1]
 *
 * Si tous les axes valent 50, alors `centered_i = 0` pour tout i, et le
 * boost est strictement nul → comportement IDENTIQUE au pré-CS4 (le tri
 * tombe sur la priorité absolue haute/moyenne/info uniquement).
 *
 * Cette propriété est l'invariant qui préserve les cas-tests existants
 * (notamment Marc CS1 41 % cf. lib/analyse/__tests__/scores-projection-recos
 * et 8 personas CS3) : tant qu'un user n'a pas migré (objectifs_axes IS NULL
 * en DB), le moteur retombe sur `priorite` legacy via PRIORITE_BOOST_FALLBACK
 * (cf. lib/analyse/recommandations.ts).
 *
 * Si l'utilisateur déplace un axe à 100 (max-norm) ET la matrice
 * d'affinité vaut 1.0 pour cette paire, le boost atteint son maximum +1
 * (recommandation remontée d'1 cran au tie-breaker). Si l'axe à 0
 * (centered = -1) avec affinity = 1.0, le boost vaut -1 (recommandation
 * descendue). Échelle cohérente avec l'ancien PRIORITE_BOOST (-2..+1).
 *
 * ⚠️ AVERTISSEMENT — calibration matrice :
 *
 * Toute modification de AFFINITY_MATRIX doit préserver les outputs des
 * 5 personas de référence dans `objectifs.regression.test.ts`. Si un
 * test casse, c'est que la matrice n'est plus calibrée — ré-équilibrer
 * AVANT de modifier le test.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

/** IDs stables des 4 axes (ne JAMAIS renommer — référencés en JSONB DB). */
export const OBJECTIF_AXES = ['rendement', 'securite', 'optimisation', 'transmission'] as const
export type ObjectifAxe = typeof OBJECTIF_AXES[number]

/** Sortie typée de `profiles.objectifs_axes` JSONB. */
export interface ObjectifsAxes {
  readonly rendement:    number
  readonly securite:     number
  readonly optimisation: number
  readonly transmission: number
}

/** Catégories de recommandations existantes + CS4 transmission. */
export type RecoCategorieAffinity =
  | 'diversification'
  | 'fiscalite'
  | 'fire'
  | 'risque'
  | 'liquidite'
  | 'transmission'   // CS4 LOT 6 — nouvelle catégorie (fermeture trou catalogue)

// ────────────────────────────────────────────────────────────────────
// Libellés UI
// ────────────────────────────────────────────────────────────────────

export const OBJECTIF_LABELS: Readonly<Record<ObjectifAxe, string>> = {
  rendement:    'Rendement',
  securite:     'Sécurité',
  optimisation: 'Optimisation fiscale',
  transmission: 'Transmission',
}

/** Libellés COURTS pour les affichages contraints en largeur (ligne « Tes
 *  priorités » de ProfilCard / LiveAvatarCard). "Optimisation fiscale"
 *  fait tronquer la ligne sur les cartes étroites — on garde "Optimisation"
 *  en compact (le contexte FIRECORE rend l'aspect fiscal évident). */
export const OBJECTIF_LABELS_COMPACT: Readonly<Record<ObjectifAxe, string>> = {
  rendement:    'Rendement',
  securite:     'Sécurité',
  optimisation: 'Optimisation',
  transmission: 'Transmission',
}

/** Phrase courte affichée sous chaque slider Step Risque+FIRE. */
export const OBJECTIF_DESCRIPTIONS: Readonly<Record<ObjectifAxe, string>> = {
  rendement:    'Faire travailler ton patrimoine — revenus passifs, valorisation long terme.',
  securite:     'Coussin cash, assurance, stabilité familiale. Dormir tranquille.',
  optimisation: 'Réduire la fiscalité — PEA, AV, PER, défisc immo.',
  transmission: 'Préparer l\'avenir de tes proches — donation, AV bénéficiaires, démembrement.',
}

/** Valeur par défaut (neutre) si l'utilisateur n'a rien renseigné. */
export const OBJECTIF_DEFAULT_VALUE = 50
export const OBJECTIFS_NEUTRES: ObjectifsAxes = {
  rendement:    OBJECTIF_DEFAULT_VALUE,
  securite:     OBJECTIF_DEFAULT_VALUE,
  optimisation: OBJECTIF_DEFAULT_VALUE,
  transmission: OBJECTIF_DEFAULT_VALUE,
}

// ────────────────────────────────────────────────────────────────────
// Matrice d'affinité [4 axes × 6 catégories]
// ────────────────────────────────────────────────────────────────────
//
// Valeurs ∈ [-1, +1]. Convention :
//   +1 → axe FORTEMENT affilié à cette catégorie (booster ↑)
//    0 → neutre
//   -1 → axe AYANT BESOIN de cette catégorie DESCENDUE
//
// Calibration ligne par ligne (justifications) :
//
// `rendement` (faire travailler le patrimoine) :
//   - diversification +0.8 : un patrimoine concentré n'optimise pas le
//     rendement risk-adjusted. Diversifier remonte.
//   - fiscalite +0.4 : optimiser fiscalement augmente le rendement net,
//     mais c'est secondaire (l'optim primaire vit dans `optimisation`).
//   - fire +0.8 : retard FIRE = signal direct de sous-rendement, à remonter.
//   - risque 0 : neutre — un user rendement-first n'a pas peur du
//     risque mais n'en cherche pas non plus activement plus.
//   - liquidite -0.6 : un user rendement-first a tendance à TROP investir
//     son cash → moins prioritaire de pousser sur la liquidité.
//   - transmission -0.2 : très léger downgrade (rendement ≠ transmission).
//
// `securite` (dormir tranquille) :
//   - diversification +0.4 : la diversification réduit la volatilité.
//   - fiscalite -0.2 : un user sécurité-first n'a pas la fiscalité en
//     tête à la fois — léger downgrade.
//   - fire +0.4 : si retard FIRE détecté, c'est un signal de risque
//     d'avenir.
//   - risque +0.8 : incohérence profil = ALERTE majeure pour
//     sécurité-first, à remonter.
//   - liquidite +1.0 : c'est LE signal cash-pour-sécurité, à remonter
//     systématiquement.
//   - transmission +0.2 : la sécurité prévoit aussi l'imprévu = lien faible.
//
// `optimisation` (réduire la fiscalité) :
//   - diversification +0.2 : la diversification d'enveloppes est un
//     levier d'optim faible.
//   - fiscalite +1.0 : c'est LE signal PEA/PER/AV à remonter.
//   - fire +0.4 : retard FIRE → forcer le défisc pour rattraper.
//   - risque 0 : neutre.
//   - liquidite +0.2 : un cash dormant a un coût d'opportunité fiscal.
//   - transmission +0.4 : l'AV et le PER sont aussi des outils
//     successoraux, lien moyen.
//
// `transmission` (préparer l'après) :
//   - diversification +0.4 : patrimoine équilibré = facilité de partage.
//   - fiscalite +0.4 : optim défisc → optim transmission via donation.
//   - fire -0.2 : sortir tôt n'est PAS un signal de transmission.
//   - risque 0 : neutre.
//   - liquidite +0.2 : un peu de cash = aisance pour donations.
//   - transmission +1.0 : SIGNAL DIRECT (CS4 LOT 6 — nouvelle catégorie).

export const AFFINITY_MATRIX: Readonly<Record<ObjectifAxe, Record<RecoCategorieAffinity, number>>> = {
  rendement: {
    diversification: +0.8,
    fiscalite:       +0.4,
    fire:            +0.8,
    risque:           0.0,
    liquidite:       -0.6,
    transmission:    -0.2,
  },
  securite: {
    diversification: +0.4,
    fiscalite:       -0.2,
    fire:            +0.4,
    risque:          +0.8,
    liquidite:       +1.0,
    transmission:    +0.2,
  },
  optimisation: {
    diversification: +0.2,
    fiscalite:       +1.0,
    fire:            +0.4,
    risque:           0.0,
    liquidite:       +0.2,
    transmission:    +0.4,
  },
  transmission: {
    diversification: +0.4,
    fiscalite:       +0.4,
    fire:            -0.2,
    risque:           0.0,
    liquidite:       +0.2,
    transmission:    +1.0,
  },
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/**
 * Normalise les axes par max-norm : chaque axe est divisé par le max
 * pour ramener l'échelle dans [0..1] tout en préservant les RAPPORTS.
 *
 * Utilité : un user qui met TOUT à 80 vs TOUT à 50 ne doit pas voir
 * une amplification artificielle du boost — c'est le rapport entre les
 * axes qui exprime sa préférence, pas la valeur absolue.
 *
 * Si max === 0 (tous à 0), retourne les axes inchangés (boost calculé
 * sur 0 = 0 partout, neutre).
 */
export function normalizeAxes(axes: ObjectifsAxes): ObjectifsAxes {
  const max = Math.max(axes.rendement, axes.securite, axes.optimisation, axes.transmission)
  if (max <= 0) return axes
  return {
    rendement:    (axes.rendement    / max) * 100,
    securite:     (axes.securite     / max) * 100,
    optimisation: (axes.optimisation / max) * 100,
    transmission: (axes.transmission / max) * 100,
  }
}

/**
 * Calcule le boost à appliquer à une recommandation selon ses 4 axes
 * d'objectifs déclarés.
 *
 * Formule :
 *   boost(categorie) = Σ_axe ((axe - 50) / 50) × AFFINITY[axe][categorie]
 *
 * - Les axes sont centrés autour de 50 (= neutre).
 * - Pour des axes tous = 50, le boost est strictement 0 (invariant
 *   non-régression Marc CS1).
 * - L'échelle finale est dans [-N, +N] où N = nb d'axes (= 4). En
 *   pratique le boost réaliste se concentre dans [-2, +2] car les
 *   matrices ne se cumulent pas toutes en même direction.
 *
 * Note : on n'applique pas `normalizeAxes` ici par défaut. C'est au
 * caller de décider s'il préfère le boost "absolu" (l'amplitude des
 * axes compte) ou "relatif" (seul le rapport compte, via normalizeAxes
 * en amont). Le moteur de recos utilise les axes BRUTS — un user qui
 * met tout à 50 ou tout à 100 a un boost identique (différentiel = 0).
 */
export function computeObjectifsBoost(
  axes:      ObjectifsAxes,
  categorie: RecoCategorieAffinity,
): number {
  let boost = 0
  for (const axe of OBJECTIF_AXES) {
    const value    = axes[axe]
    const centered = (value - OBJECTIF_DEFAULT_VALUE) / OBJECTIF_DEFAULT_VALUE  // [-1, +1]
    boost += centered * AFFINITY_MATRIX[axe][categorie]
  }
  return boost
}

/**
 * Trie les axes par valeur décroissante. Utilisé par ProfilCard /
 * LiveAvatarCard pour afficher la hiérarchie de l'utilisateur en bullet.
 *
 * Tri stable en cas d'égalité : ordre alphabétique des labels FR. Ça
 * évite les "swap" visuels entre re-renders (Sécurité 50 / Rendement
 * 50 → l'ordre alphabétique tranche déterministe).
 */
export function sortAxesByValue(axes: ObjectifsAxes): Array<{ axe: ObjectifAxe; value: number }> {
  return OBJECTIF_AXES
    .map((axe) => ({ axe, value: axes[axe] }))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      // Égalité : ordre alphabétique des LABELS UI (pas des ids).
      return OBJECTIF_LABELS[a.axe].localeCompare(OBJECTIF_LABELS[b.axe], 'fr')
    })
}

// ────────────────────────────────────────────────────────────────────
// Présentation compacte (UI ProfilCard / LiveAvatarCard)
// ────────────────────────────────────────────────────────────────────

/** Seuil heuristique au-DESSOUS ou ÉGAL duquel on considère un profil
 *  "équilibré" : `max(axes) - min(axes) <= BALANCED_SPREAD_THRESHOLD` →
 *  on n'affiche aucun axe en particulier mais le label "Profil équilibré".
 *  Inclusif sur la zone équilibrée (cf. spec « seuil exclusif » =
 *  exclusif côté hiérarchisé). Donc spread = 15 → équilibré. */
export const BALANCED_SPREAD_THRESHOLD = 15

export interface FormatTopPrioritiesOptions {
  /** Inclure la valeur après le label. Défaut true. */
  showValues?: boolean
  /** Nombre d'axes max à afficher. Défaut 2. */
  topN?: number
  /** Libellé à afficher si profil équilibré (max-min < seuil). */
  balancedLabel?: string
}

/**
 * Formate les axes pour un affichage COMPACT type "Tes priorités".
 *
 * Stratégie :
 *  1. Si l'amplitude (max - min) est inférieure à BALANCED_SPREAD_THRESHOLD,
 *     on retourne `balancedLabel` ("Profil équilibré" par défaut) — il
 *     n'y a pas de hiérarchie suffisante pour mettre en avant.
 *  2. Sinon, on trie les axes par valeur desc + ordre alphabétique
 *     (sortAxesByValue) et on prend les `topN` premiers.
 *
 * Returns : la chaîne formatée prête à coller dans une ligne UI.
 *
 * Exemples (showValues=true, topN=2) :
 *   {80,30,65,30} → "Rendement 80 · Optimisation fiscale 65"
 *   {50,50,50,50} → "Profil équilibré"
 *   {60,50,55,45} → "Profil équilibré"     (spread 15, seuil exclusif)
 *   {60,50,55,40} → "Rendement 60 · Optimisation fiscale 55"   (spread 20)
 *   {80,80,30,30} → "Rendement 80 · Sécurité 80"
 */
export function formatTopPriorities(
  axes:    ObjectifsAxes,
  options: FormatTopPrioritiesOptions = {},
): string {
  const showValues    = options.showValues    ?? true
  const topN          = options.topN          ?? 2
  const balancedLabel = options.balancedLabel ?? 'Profil équilibré'

  const values = [axes.rendement, axes.securite, axes.optimisation, axes.transmission]
  const max = Math.max(...values)
  const min = Math.min(...values)

  // (1) Heuristique « profil équilibré » : pas de hiérarchie discernable.
  // Inclusif : spread = 15 → équilibré (cf. BALANCED_SPREAD_THRESHOLD).
  if (max - min <= BALANCED_SPREAD_THRESHOLD) return balancedLabel

  // (2) Trie + sélection top N. L'ordre stable (alphabétique en cas d'égalité)
  // est garanti par sortAxesByValue → pas de "swap" visuel entre renders.
  // Libellés COMPACTS ("Optimisation" et non "Optimisation fiscale") pour
  // éviter la truncation sur cartes étroites.
  return sortAxesByValue(axes)
    .slice(0, Math.max(1, topN))
    .map((a) => showValues
      ? `${OBJECTIF_LABELS_COMPACT[a.axe]} ${a.value}`
      : OBJECTIF_LABELS_COMPACT[a.axe])
    .join(' · ')
}

/**
 * Conversion silencieuse du legacy `priorite` vers `objectifs_axes`
 * (L8 — migration data + filet de sécurité au runtime).
 *
 * Si l'utilisateur n'a pas encore migré (objectifs_axes IS NULL en DB)
 * mais a un `priorite` legacy, on peut auto-dériver les axes. C'est une
 * approximation acceptée — l'user est invité à affiner via bandeau.
 */
export function deriveObjectifsFromPriorite(priorite: string | null | undefined): ObjectifsAxes | null {
  if (!priorite) return null
  const norm = priorite.toLowerCase().trim()
  // Mapping documenté (cf. K1 cadrage CS4). Approximation conservatrice.
  if (norm.includes('equilibre'))           return OBJECTIFS_NEUTRES
  if (norm.includes('securite') || norm.includes('famille')) {
    return { rendement: 30, securite: 80, optimisation: 40, transmission: 60 }
  }
  if (norm.includes('transmission'))        return { rendement: 30, securite: 50, optimisation: 50, transmission: 80 }
  if (norm.includes('independance'))        return { rendement: 80, securite: 40, optimisation: 60, transmission: 30 }
  return null
}
