/**
 * Helper pur de mise en page de la jauge matelas (Cash V1.1-POLISH +
 * V1.2-POLISH double marqueur).
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
 * **V1.2-POLISH** — Deux curseurs distincts :
 *   - Curseur PRINCIPAL (▼) sur `totalCashEur` (= cashEffectif post V1.2,
 *     c'est le matelas réel hors intentions volontaires).
 *   - Marker SECONDAIRE (○) sur `cashBrutEur` (= cash total), affiché
 *     uniquement si l'utilisateur a des intentions actives ET si la
 *     superposition visuelle des deux curseurs n'est pas trop forte
 *     (`|brutPct − effectifPct| ≥ MIN_GAP_PCT`).
 *
 * Si `cashBrutEur` est omis, le comportement est strictement identique à
 * V1.1-POLISH (un seul curseur, `showBrutMarker = false`).
 *
 * Pur, synchrone, aucun I/O. Pas de dépendance au DOM.
 */

export interface JaugeMatelasInput {
  /**
   * Cash effectif = matelas réel. Position du curseur PRINCIPAL.
   * Avant V1.2 : représentait simplement le « totalCash brut » — le
   * champ garde son nom pour préserver la signature rétro-compatible
   * (la sémantique est compatible : sans intentions, brut === effectif).
   */
  totalCashEur:  number
  cibleBasseEur: number
  cibleHauteEur: number
  /**
   * V1.2-POLISH — Cash brut, position du marker SECONDAIRE. Si omis ou
   * strictement égal à `totalCashEur`, on désactive le marker (= cas 0
   * intent → comportement V1.1-POLISH préservé).
   */
  cashBrutEur?:  number
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

  // ── Curseur PRINCIPAL (effectif) ─────────────────────────────────
  /** Position du curseur principal en % [0, 100]. */
  cursorPct: number
  /** `true` si `totalCashEur` dépasse `domainMaxEur`. */
  overflow: boolean
  // ── Alias V1.2-POLISH (sémantique explicite) ─────────────────────
  /** Identique à `cursorPct`. */
  cursorEffectifPct: number
  /** Identique à `overflow`. */
  cursorEffectifOverflow: boolean

  // ── Marker SECONDAIRE (brut) ─────────────────────────────────────
  /** Position du marker brut en % [0, 100]. */
  cursorBrutPct: number
  /** `true` si `cashBrutEur` dépasse `domainMaxEur`. */
  cursorBrutOverflow: boolean
  /**
   * `true` si on doit afficher le marker brut. Faux si :
   *   - `cashBrutEur` n'est pas fourni
   *   - `cashBrutEur === totalCashEur` (aucune intent active)
   *   - `|cursorBrutPct − cursorEffectifPct| < MIN_GAP_PCT` (superposition)
   */
  showBrutMarker: boolean

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
 * V1.2-POLISH — Écart minimal (en % de la largeur de jauge) entre les
 * deux curseurs pour afficher le marker brut. En dessous, les deux
 * symboles se superposeraient visuellement et le marker n'apporterait
 * rien à la lecture.
 */
const MIN_GAP_PCT = 2

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

  // ── Curseur PRINCIPAL (effectif) ─────────────────────────────────
  const effectifRaw = Math.max(0, input.totalCashEur)
  const cursorEffectifOverflow = effectifRaw > domainMaxEur
  const cursorEffectifPct = round2(pct(effectifRaw))

  // ── Marker SECONDAIRE (brut) ─────────────────────────────────────
  const hasBrut = typeof input.cashBrutEur === 'number'
    && Number.isFinite(input.cashBrutEur)
  const brutRaw = hasBrut ? Math.max(0, input.cashBrutEur as number) : effectifRaw
  const cursorBrutOverflow = hasBrut && brutRaw > domainMaxEur
  const cursorBrutPct = round2(pct(brutRaw))

  // Évitement de chevauchement : on ne montre le marker que s'il y a
  // un vrai écart de position.
  const sameValue = !hasBrut || brutRaw === effectifRaw
  const tooClose  = Math.abs(cursorBrutPct - cursorEffectifPct) < MIN_GAP_PCT
  const showBrutMarker = !sameValue && !tooClose

  return {
    domainMaxEur,
    // Champs V1.1 (rétro-compat) ─────────────────────────────────────
    cursorPct: cursorEffectifPct,
    overflow:  cursorEffectifOverflow,
    // Alias V1.2-POLISH explicites ───────────────────────────────────
    cursorEffectifPct,
    cursorEffectifOverflow,
    // Marker brut ────────────────────────────────────────────────────
    cursorBrutPct,
    cursorBrutOverflow,
    showBrutMarker,
    // ─────────────────────────────────────────────────────────────────
    segments: {
      rouge:  { widthPct: widthRouge,  upperBoundEur: cBasse       },
      vert:   { widthPct: widthVert,   upperBoundEur: cHaute       },
      orange: { widthPct: widthOrange, upperBoundEur: domainMaxEur },
    },
    graduations: [0, cBasse, cHaute, domainMaxEur] as const,
    graduationsPct: [0, round2(rougeEnd), round2(vertEnd), 100] as const,
  }
}
