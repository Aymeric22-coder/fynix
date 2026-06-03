/**
 * Helper pur de mise en page de la jauge matelas (Cash V1.1-POLISH).
 *
 * Calcule les positions horizontales (% du parent) de chaque élément
 * d'affichage à partir des seules cibles métier :
 *
 *      0 €              cibleBasse        cibleHaute       cibleHaute × 1,5
 *   ├──────── Insuff. ─────┼──── Cible ────┼────── Excédent ──────┤
 *
 * Domain : `[0, cibleHaute × 1,5]`. Cap visuel délibéré : un cash
 * supérieur à 150 % de la cible haute affiche le curseur à droite avec
 * un flag `overflow`. Au-delà, on perdrait la lisibilité du segment vert.
 *
 * Pur, synchrone, aucun I/O. Pas de dépendance au DOM.
 */

export interface JaugeMatelasInput {
  totalCashEur: number
  cibleBasseEur: number
  cibleHauteEur: number
}

export interface JaugeSegment {
  /** Largeur en % du parent. */
  widthPct: number
  /** Borne supérieure du segment (€). */
  upperBoundEur: number
}

export interface JaugeMatelasLayout {
  /** Domaine = cibleHaute × 1,5. Sert de dénominateur à toutes les positions. */
  domainMaxEur: number
  /** Position du curseur en % [0, 100]. */
  cursorPct: number
  /** `true` si totalCash dépasse `domainMaxEur` (curseur clampé à 100 %). */
  overflow: boolean
  /** Largeurs et bornes des 3 segments (rouge / vert / orange). */
  segments: {
    rouge:  JaugeSegment
    vert:   JaugeSegment
    orange: JaugeSegment
  }
  /** 4 graduations (€) : 0, cibleBasse, cibleHaute, cibleHaute × 1,5. */
  graduations: readonly [number, number, number, number]
  /** Positions x (%) des 4 graduations, alignées avec les bornes de segments. */
  graduationsPct: readonly [number, number, number, number]
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n))

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Précondition validée par `computeMatelasCible` : `cibleBasse > 0` ET
 * `cibleBasse ≤ cibleHaute`. Au cas où, on s'auto-protège :
 *   - cibleBasse ≤ 0    → utilise un domaine fallback à 1 € pour éviter
 *     division par zéro ; les segments sont collapsés.
 *   - cibleBasse > cibleHaute (input pathologique) → on swap.
 */
export function computeJaugeMatelas(input: JaugeMatelasInput): JaugeMatelasLayout {
  const cBasse = Math.max(0, input.cibleBasseEur)
  const cHaute = Math.max(cBasse, input.cibleHauteEur)
  const domainMaxEur = Math.max(1, cHaute * 1.5)

  const pct = (v: number): number =>
    clamp((v / domainMaxEur) * 100, 0, 100)

  const rougeEnd  = pct(cBasse)
  const vertEnd   = pct(cHaute)
  const orangeEnd = 100

  const widthRouge  = round2(rougeEnd)
  const widthVert   = round2(vertEnd - rougeEnd)
  const widthOrange = round2(orangeEnd - vertEnd)

  const totalRaw = Math.max(0, input.totalCashEur)
  const overflow = totalRaw > domainMaxEur
  const cursorPct = round2(pct(totalRaw))

  return {
    domainMaxEur,
    cursorPct,
    overflow,
    segments: {
      rouge:  { widthPct: widthRouge,  upperBoundEur: cBasse       },
      vert:   { widthPct: widthVert,   upperBoundEur: cHaute       },
      orange: { widthPct: widthOrange, upperBoundEur: domainMaxEur },
    },
    graduations: [0, cBasse, cHaute, domainMaxEur] as const,
    graduationsPct: [0, round2(rougeEnd), round2(vertEnd), 100] as const,
  }
}
