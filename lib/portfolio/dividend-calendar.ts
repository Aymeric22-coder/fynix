/**
 * Detection de frequence + projection de revenus + calendrier
 * des prochains versements de dividendes.
 *
 * Source de donnees (validation Étape 0) : ce module derive
 * EXCLUSIVEMENT des lignes `transactions WHERE transaction_type = 'dividend'`
 * (chargees par `build-from-db.ts`). Aucune table dediee "dividends"
 * n'existe a ce jour ; ce point est documente ici pour faciliter une
 * eventuelle future migration vers une table isolee.
 *
 * Algorithme detection : on calcule les intervalles en jours entre
 * versements consecutifs (tries chronologiquement) puis on prend la
 * MEDIANE (plus robuste a un retard ou avance ponctuel qu'une moyenne).
 *
 * Projection : `meanAmountRef × paymentsPerYear` ou `paymentsPerYear`
 * decoule de la frequence detectee (12, 4, 2, 1, ou 0 pour 'unknown').
 *
 * Calendrier : pour chaque projection, on genere les cycles attendus
 * dans la fenetre [mois courant, mois courant + monthCount) en
 * AVANCANT par l'intervalle median REEL de la position (pas un nombre
 * de jours canonique). Une position trimestrielle qui verse tous les
 * 87 jours sera projetee a 87j d'intervalle, pas a 91j — ce qui evite
 * une derive sur 12 mois.
 *
 * Module pur : aucune dependance Supabase ni Next.js. `now` est
 * injectable pour la testabilite (defaut `new Date()`).
 */

// ─── Types publics ────────────────────────────────────────────────────

export type DividendFrequency =
  | 'monthly'      // ~30j entre versements  → 12/an
  | 'quarterly'    // ~90j                   →  4/an
  | 'semi-annual'  // ~180j                  →  2/an
  | 'annual'       // ~365j                  →  1/an
  | 'unknown'      // < 2 versements ou irregulier

export interface DividendProjection {
  positionId:          string
  ticker:              string
  frequency:           DividendFrequency
  /** 12 / 4 / 2 / 1 ; 0 si frequency = 'unknown'. */
  paymentsPerYear:     number
  /** Montant moyen par versement, en devise ref. */
  meanAmountRef:       number
  /** = meanAmountRef × paymentsPerYear. 0 si 'unknown'. */
  annualProjectionRef: number
  /** YYYY-MM-DD, null si frequency = 'unknown'. */
  nextExpectedDate:    string | null
  /** 'high' si ≥ 3 versements TTM detectes, 'low' sinon. */
  confidenceLevel:     'high' | 'low'
  /**
   * Intervalle median en jours entre versements TTM. Necessaire pour que
   * `buildDividendCalendar` puisse projeter les cycles a l'intervalle
   * historique reel de la position (87j, 91j…) plutot qu'a un nombre de
   * jours canonique par frequence (ce qui derive sur 12 mois).
   * `null` si frequency = 'unknown' ou < 2 versements TTM.
   */
  medianIntervalDays:  number | null
}

export interface CalendarMonth {
  /** YYYY-MM */
  month: string
  expectedPayments: {
    positionId:        string
    ticker:            string
    expectedAmountRef: number
    /** Un versement reel existe deja sur cette position ce mois-ci. */
    isConfirmed:       boolean
  }[]
  totalExpectedRef: number
}

// ─── Constantes internes ──────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000
const TTM_WINDOW_MS = 365 * MS_PER_DAY

// ─── Helpers ──────────────────────────────────────────────────────────

/** Mediane d'un tableau non vide. Tri stable, moyenne des deux centraux si pair. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  if (n % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2
  return sorted[mid]!
}

function paymentsPerYearFor(f: DividendFrequency): number {
  switch (f) {
    case 'monthly':     return 12
    case 'quarterly':   return 4
    case 'semi-annual': return 2
    case 'annual':      return 1
    case 'unknown':     return 0
  }
}

/** Parse 'YYYY-MM-DD' en Date UTC midnight (deterministe, sans drift TZ). */
function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`)
}

/** Format YYYY-MM-DD (UTC). */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Format YYYY-MM (UTC). */
function formatMonth(d: Date): string {
  return d.toISOString().slice(0, 7)
}

// ─── API publique ─────────────────────────────────────────────────────

/**
 * Detecte la frequence d'une serie de dates de dividendes.
 *
 * Tri en interne par ordre chronologique avant de calculer les
 * intervalles → l'appelant n'a pas a se soucier de l'ordre.
 *
 * Mapping (sur la mediane des intervalles en jours) :
 *   ≤ 45    → 'monthly'
 *   ≤ 135   → 'quarterly'
 *   ≤ 270   → 'semi-annual'
 *   ≤ 500   → 'annual'
 *   au-dela → 'unknown'
 */
export function detectFrequency(dates: string[]): DividendFrequency {
  if (dates.length < 2) return 'unknown'
  const sorted = [...dates].sort((a, b) => a.localeCompare(b))
  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const days = (parseDate(sorted[i]!).getTime() - parseDate(sorted[i - 1]!).getTime()) / MS_PER_DAY
    intervals.push(days)
  }
  const med = median(intervals)
  if (med <= 45)  return 'monthly'
  if (med <= 135) return 'quarterly'
  if (med <= 270) return 'semi-annual'
  if (med <= 500) return 'annual'
  return 'unknown'
}

export interface ProjectDividendsParams {
  positions: { id: string; ticker: string }[]
  dividendsByPosition: Record<string, {
    date:      string  // YYYY-MM-DD
    amountRef: number  // deja converti en devise ref par l'appelant
  }[]>
  now?: Date
}

/**
 * Pour chaque position, calcule sa projection annuelle a partir de son
 * historique de dividendes TTM (12 mois glissants).
 *
 * Une position sans dividende TTM est **omise** du retour (rien a projeter).
 * Les projections sont triees par `annualProjectionRef` descendant.
 */
export function projectDividends(
  params: ProjectDividendsParams,
): DividendProjection[] {
  const now = params.now ?? new Date()
  const nowMs = now.getTime()
  const ttmStartMs = nowMs - TTM_WINDOW_MS

  const out: DividendProjection[] = []
  for (const pos of params.positions) {
    const allDivs = params.dividendsByPosition[pos.id] ?? []
    // Filtre TTM (bornes inclusives sur [now-365j, now], futur exclu)
    const ttm = allDivs.filter((d) => {
      const ts = parseDate(d.date).getTime()
      return ts >= ttmStartMs && ts <= nowMs
    })
    if (ttm.length === 0) continue

    const sorted = [...ttm].sort((a, b) => a.date.localeCompare(b.date))
    const dates = sorted.map((d) => d.date)
    const frequency = detectFrequency(dates)
    const paymentsPerYear = paymentsPerYearFor(frequency)

    const meanAmountRef       = ttm.reduce((s, d) => s + d.amountRef, 0) / ttm.length
    const annualProjectionRef = meanAmountRef * paymentsPerYear

    let medianIntervalDays: number | null = null
    let nextExpectedDate:   string | null = null

    if (frequency !== 'unknown' && sorted.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        const days = (parseDate(sorted[i]!.date).getTime() - parseDate(sorted[i - 1]!.date).getTime()) / MS_PER_DAY
        intervals.push(days)
      }
      medianIntervalDays = median(intervals)

      // Cycle suivant : dernier versement + intervalle median.
      // Si dans le passe, on avance jusqu'a depasser `now`.
      const lastMs = parseDate(sorted[sorted.length - 1]!.date).getTime()
      let nextMs = lastMs + medianIntervalDays * MS_PER_DAY
      while (nextMs <= nowMs) {
        nextMs += medianIntervalDays * MS_PER_DAY
      }
      nextExpectedDate = formatDate(new Date(nextMs))
    }

    const confidenceLevel: 'high' | 'low' = ttm.length >= 3 ? 'high' : 'low'

    out.push({
      positionId: pos.id,
      ticker:     pos.ticker,
      frequency,
      paymentsPerYear,
      meanAmountRef,
      annualProjectionRef,
      nextExpectedDate,
      confidenceLevel,
      medianIntervalDays,
    })
  }

  return out.sort((a, b) => b.annualProjectionRef - a.annualProjectionRef)
}

export interface BuildDividendCalendarParams {
  projections:        DividendProjection[]
  confirmedDividends: { positionId: string; date: string; amountRef: number }[]
  /** Defaut 12. */
  monthCount?: number
  now?: Date
}

/**
 * Genere `monthCount` mois consecutifs a partir du mois courant
 * (mois courant inclus). Pour chaque mois, liste les versements
 * projetes en avancant par l'intervalle median REEL de chaque position
 * (cf. contrainte utilisateur point 3 — fidelite a la realite historique).
 *
 * `isConfirmed` est calcule par PAIEMENT (position × mois) : true si un
 * dividende reel existe sur la meme position dans le meme mois calendaire.
 *
 * Les projections `frequency='unknown'` (ou `medianIntervalDays=null`)
 * sont **exclues** du calendrier (rien a projeter).
 */
export function buildDividendCalendar(
  params: BuildDividendCalendarParams,
): CalendarMonth[] {
  const now        = params.now ?? new Date()
  const monthCount = params.monthCount ?? 12

  // Suite des mois YYYY-MM a partir du mois courant (UTC).
  const startY = now.getUTCFullYear()
  const startM = now.getUTCMonth()
  const monthKeys: string[] = []
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(Date.UTC(startY, startM + i, 1))
    monthKeys.push(formatMonth(d))
  }
  const lastMonthBoundaryMs = Date.UTC(startY, startM + monthCount, 1)
  const firstMonthStartMs   = Date.UTC(startY, startM, 1)

  // Index des versements confirmes par (mois, position).
  const confirmedKey = (m: string, posId: string) => `${m}|${posId}`
  const confirmed = new Set<string>()
  for (const c of params.confirmedDividends) {
    const m = c.date.slice(0, 7)
    confirmed.add(confirmedKey(m, c.positionId))
  }

  // Buckets de paiements projetes par mois.
  const bucket = new Map<string, CalendarMonth['expectedPayments']>()
  for (const m of monthKeys) bucket.set(m, [])

  for (const proj of params.projections) {
    if (proj.frequency === 'unknown' || proj.paymentsPerYear === 0) continue
    if (proj.nextExpectedDate === null || proj.medianIntervalDays === null) continue

    const intervalMs = proj.medianIntervalDays * MS_PER_DAY
    if (intervalMs <= 0) continue  // garde-fou (jamais en pratique)

    let cycleMs = parseDate(proj.nextExpectedDate).getTime()
    // Si nextExpectedDate est anterieure au premier mois de la fenetre
    // (peut arriver si la projection a ete calculee a un autre `now`),
    // on avance jusqu'a entrer dans la fenetre.
    while (cycleMs < firstMonthStartMs) cycleMs += intervalMs

    while (cycleMs < lastMonthBoundaryMs) {
      const monthKey = formatMonth(new Date(cycleMs))
      const slot     = bucket.get(monthKey)
      if (slot) {
        slot.push({
          positionId:        proj.positionId,
          ticker:            proj.ticker,
          expectedAmountRef: proj.meanAmountRef,
          isConfirmed:       confirmed.has(confirmedKey(monthKey, proj.positionId)),
        })
      }
      cycleMs += intervalMs
    }
  }

  return monthKeys.map((m) => {
    const payments = bucket.get(m) ?? []
    const totalExpectedRef = payments.reduce((s, p) => s + p.expectedAmountRef, 0)
    return { month: m, expectedPayments: payments, totalExpectedRef }
  })
}
