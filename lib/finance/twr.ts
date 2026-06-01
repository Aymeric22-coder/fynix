/**
 * Time-Weighted Return — moteur pur (V1.3 P0.3).
 *
 * Le TWR mesure la performance d'un portefeuille en NEUTRALISANT l'effet des
 * apports et retraits externes — c'est la métrique correcte pour comparer
 * une stratégie d'investissement à un benchmark, à la différence du CAGR
 * patrimonial qui inclut les apports d'épargne.
 *
 * Formule :
 *   TWR_cumulé    = Π_i (1 + r_i) − 1   avec r_i = (end_i − start_i) / start_i
 *   TWR_annualisé = (1 + TWR_cumulé)^(365 / totalDays) − 1
 *
 * Chaque `TwrSegment` représente une période SANS flux externe : la valeur
 * de départ est observée APRÈS le flux d'entrée précédent, la valeur de fin
 * est observée JUSTE AVANT le flux suivant (ou à la date finale).
 *
 * **Aucun I/O ici.** L'assembleur `lib/portfolio/transaction-segments.ts`
 * construit les segments à partir des transactions ; cette fonction se
 * contente du calcul mathématique.
 */

export interface TwrSegment {
  startDate:     Date
  endDate:       Date
  startValueEur: number
  endValueEur:   number
}

export interface TwrResult {
  /** Performance cumulée (en %), pré-annualisation. */
  twrCumulePct:     number
  /** Performance annualisée (en %), prête à comparer à un benchmark annuel. */
  twrAnnualisePct:  number
  /** Nombre de segments effectivement utilisés (après filtrage). */
  segmentCount:     number
  /** Durée totale couverte par les segments, en jours calendaires. */
  totalDays:        number
  /**
   * `true` si `totalDays ∈ [90, 365)` — l'annualisation est extrapolée à
   * partir d'un historique trop court. L'UI doit afficher un caveat.
   */
  extrapole:        boolean
}

const MIN_DAYS_FOR_ANNUALIZATION = 90  // < 3 mois : null (cf. brief P0.3)
const FULL_YEAR_DAYS             = 365

const dayMs = 86_400_000

function durationDays(seg: TwrSegment): number {
  return (seg.endDate.getTime() - seg.startDate.getTime()) / dayMs
}

/**
 * Calcule le TWR cumulé et annualisé à partir d'une liste de segments.
 *
 * Filtres appliqués :
 *   - Segments avec `startValueEur <= 0` ignorés (rendement non défini sur
 *     une base nulle ou négative — typiquement le segment qui démarre avant
 *     tout dépôt).
 *   - Segments avec `endDate <= startDate` ignorés (saisie incohérente).
 *
 * Retours `null` :
 *   - Liste vide après filtrage.
 *   - `totalDays < 90` — l'annualisation perd son sens statistique en deçà.
 *
 * Le flag `extrapole = true` est émis quand `totalDays ∈ [90, 365)`.
 */
export function computeTwr(segments: TwrSegment[]): TwrResult | null {
  const valid = segments.filter((s) =>
    s.startValueEur > 0
    && s.endValueEur >= 0
    && s.endDate.getTime() > s.startDate.getTime(),
  )
  if (valid.length === 0) return null

  const totalDays = valid.reduce((s, seg) => s + durationDays(seg), 0)
  if (totalDays < MIN_DAYS_FOR_ANNUALIZATION) return null

  // TWR cumulé = product(1 + r_i) − 1
  let factor = 1
  for (const seg of valid) {
    const r = (seg.endValueEur - seg.startValueEur) / seg.startValueEur
    factor *= 1 + r
  }
  const twrCumule = factor - 1

  // TWR annualisé. Si totalDays < 365, on extrapole (flag levé).
  const twrAnnualise = Math.pow(1 + twrCumule, FULL_YEAR_DAYS / totalDays) - 1

  return {
    twrCumulePct:    Math.round(twrCumule    * 10000) / 100,
    twrAnnualisePct: Math.round(twrAnnualise * 10000) / 100,
    segmentCount:    valid.length,
    totalDays:       Math.round(totalDays),
    extrapole:       totalDays < FULL_YEAR_DAYS,
  }
}
