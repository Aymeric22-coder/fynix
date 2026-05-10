/**
 * Analytics du portefeuille — fonctions pures.
 *
 * Aucune dépendance externe. Toutes les fonctions sont déterministes
 * et testables avec des séries de référence.
 *
 * Indicateurs implémentés :
 *   - TWR  (Time-Weighted Return)         — performance "neutre cash-flows"
 *   - MWR  (Money-Weighted Return / IRR)  — performance pondérée par montants
 *   - Drawdown (courant + max)
 *   - Volatilité (annualisée)
 *   - Sharpe ratio (avec rf optionnel)
 *
 * Conventions :
 *   - Dates : ISO yyyy-MM-dd, valeurs en devise de référence (déjà convertie).
 *   - Cash flows : montant POSITIF = apport (deposit), NÉGATIF = retrait.
 *   - Tous les retours sont en décimal (0.05 = 5%), sauf indication contraire.
 */

// ─── Types d'entrée ──────────────────────────────────────────────────────────

export interface ValuePoint {
  /** ISO yyyy-MM-dd */
  date:  string
  /** Valeur de marché à la fin de la journée. */
  value: number
}

export interface CashFlow {
  /** ISO yyyy-MM-dd */
  date:   string
  /** Positif = apport, négatif = retrait. */
  amount: number
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Nombre de jours de cotation par an pour annualisation. Standard finance. */
export const TRADING_DAYS_PER_YEAR = 252

// ─── TWR (Time-Weighted Return) ──────────────────────────────────────────────

/**
 * Calcule le TWR sur la série de valorisations, neutralisé des cash-flows.
 *
 * Méthode : on scinde la série en sous-périodes délimitées par les
 * cash-flows. Pour chaque sous-période i :
 *
 *   r_i = (V_end / (V_start_après_cashflow)) - 1
 *
 * TWR = ∏ (1 + r_i) - 1
 *
 * On suppose que le cash-flow d'une date donnée est appliqué AVANT la
 * valorisation de fin de journée à cette même date (convention beginning-of-day).
 *
 * @returns retour total sur la période (décimal, ex 0.10 = +10%) ou null si
 *          la série est trop courte ou contient une valeur ≤ 0 qui empêche
 *          le calcul.
 */
export function computeTWR(values: ValuePoint[], cashFlows: CashFlow[] = []): number | null {
  if (values.length < 2) return null

  const sortedV  = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const cfByDate = bucketCashFlows(cashFlows)

  let twrPlus1 = 1
  for (let i = 1; i < sortedV.length; i++) {
    const prev = sortedV[i - 1]!
    const curr = sortedV[i]!

    // Le cash-flow se produit à la date courante, AVANT la valo de fin de journée
    const cf = cfByDate.get(curr.date) ?? 0

    // V_start corrigé : valeur précédente + cash-flow ajouté en début de période
    const vStart = prev.value + cf
    if (vStart <= 0) return null

    const r = curr.value / vStart - 1
    twrPlus1 *= 1 + r
  }

  return twrPlus1 - 1
}

/** Annualise un TWR sur un nombre de jours donné. */
export function annualizeReturn(totalReturn: number, days: number): number {
  if (days <= 0) return 0
  const years = days / 365
  return Math.pow(1 + totalReturn, 1 / years) - 1
}

// ─── MWR / IRR (Money-Weighted Return) ───────────────────────────────────────

/**
 * Calcule le MWR (= IRR annualisé) du portefeuille.
 *
 * Modèle : on cherche r tel que la VAN soit nulle :
 *
 *   -V_0 + Σ -cf_i × (1+r)^(-t_i) + V_T × (1+r)^(-T) = 0
 *
 * où :
 *   - V_0 est la valeur initiale (traitée comme un apport au temps 0)
 *   - V_T est la valeur finale (traitée comme un retrait au temps T)
 *   - cf_i sont les cash-flows intermédiaires (positif = apport, négatif = retrait)
 *   - t_i et T sont en années
 *
 * Méthode : bissection sur [-0.99, 10]. Robuste, ne diverge pas comme Newton.
 *
 * @returns IRR annualisé (décimal) ou null si pas de solution dans la plage.
 */
export function computeMWR(values: ValuePoint[], cashFlows: CashFlow[] = []): number | null {
  if (values.length < 2) return null

  const sortedV = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const start   = sortedV[0]!
  const end     = sortedV[sortedV.length - 1]!

  const startMs   = parseDate(start.date).getTime()
  const endMs     = parseDate(end.date).getTime()
  const totalDays = (endMs - startMs) / (1000 * 60 * 60 * 24)
  if (totalDays <= 0) return null

  // Construction des flux : V_0 sortant (négatif côté investisseur),
  // cf_i, V_T entrant (positif).
  // Convention NPV : on cherche r tel que Σ flux_i / (1+r)^t_i = 0
  type Flow = { years: number; amount: number }
  const flows: Flow[] = []
  flows.push({ years: 0, amount: -start.value })

  for (const cf of cashFlows) {
    const t = (parseDate(cf.date).getTime() - startMs) / (1000 * 60 * 60 * 24)
    if (t < 0 || t > totalDays) continue
    // Apport (cf.amount > 0) côté investisseur = sortie de cash → flux NPV négatif
    flows.push({ years: t / 365, amount: -cf.amount })
  }

  flows.push({ years: totalDays / 365, amount: end.value })

  const npv = (r: number) =>
    flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + r, f.years), 0)

  return bisect(npv, -0.99, 10)
}

// ─── Drawdown ────────────────────────────────────────────────────────────────

export interface DrawdownResult {
  /** Drawdown courant (négatif ou 0). Ex: -0.15 = -15% sous le pic. */
  current: number
  /** Drawdown maximum atteint sur la période (négatif ou 0). */
  max:     number
  /** Date du pic qui précède le max drawdown. */
  peakDate:   string | null
  /** Date où le max drawdown est touché. */
  troughDate: string | null
}

/**
 * Calcule le drawdown courant et maximum sur la série de valorisations.
 *
 * Drawdown = (V_courant - V_pic_précédent) / V_pic_précédent
 */
export function computeDrawdown(values: ValuePoint[]): DrawdownResult {
  if (values.length === 0) {
    return { current: 0, max: 0, peakDate: null, troughDate: null }
  }

  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date))

  let peak = sorted[0]!.value
  let peakDateRunning = sorted[0]!.date
  let maxDD = 0
  let peakDate: string | null = sorted[0]!.date
  let troughDate: string | null = sorted[0]!.date

  for (const p of sorted) {
    if (p.value > peak) {
      peak = p.value
      peakDateRunning = p.date
    }
    const dd = peak > 0 ? (p.value - peak) / peak : 0
    if (dd < maxDD) {
      maxDD = dd
      peakDate   = peakDateRunning
      troughDate = p.date
    }
  }

  const last = sorted[sorted.length - 1]!
  const currentDD = peak > 0 ? (last.value - peak) / peak : 0

  return { current: currentDD, max: maxDD, peakDate, troughDate }
}

// ─── Volatilité ──────────────────────────────────────────────────────────────

/**
 * Calcule la volatilité (écart-type des rendements quotidiens), annualisée
 * via × sqrt(TRADING_DAYS_PER_YEAR).
 *
 * Nettoyage des cash-flows : on calcule les rendements après ajustement
 * cashflow (même logique que TWR) pour ne pas biaiser sur les apports.
 *
 * @returns volatilité annualisée (décimal) ou null si série trop courte.
 */
export function computeVolatility(
  values: ValuePoint[],
  cashFlows: CashFlow[] = [],
): number | null {
  if (values.length < 2) return null

  const sorted   = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const cfByDate = bucketCashFlows(cashFlows)

  const returns: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const curr = sorted[i]!
    const cf = cfByDate.get(curr.date) ?? 0
    const vStart = prev.value + cf
    if (vStart <= 0) continue
    returns.push(curr.value / vStart - 1)
  }

  if (returns.length < 2) return null

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1)

  const dailyStd = Math.sqrt(variance)
  return dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

// ─── Sharpe ratio ────────────────────────────────────────────────────────────

/**
 * Sharpe ratio = (rendement annualisé - taux sans risque) / volatilité annualisée.
 *
 * @param rfAnnual taux sans risque annuel (décimal, défaut 0).
 */
export function computeSharpe(
  values: ValuePoint[],
  cashFlows: CashFlow[] = [],
  rfAnnual = 0,
): number | null {
  if (values.length < 2) return null
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date))
  const startMs = parseDate(sorted[0]!.date).getTime()
  const endMs   = parseDate(sorted[sorted.length - 1]!.date).getTime()
  const days    = (endMs - startMs) / (1000 * 60 * 60 * 24)
  if (days <= 0) return null

  const twr = computeTWR(values, cashFlows)
  const vol = computeVolatility(values, cashFlows)
  if (twr === null || vol === null || vol === 0) return null

  const annualReturn = annualizeReturn(twr, days)
  return (annualReturn - rfAnnual) / vol
}

// ─── Helpers internes ────────────────────────────────────────────────────────

function bucketCashFlows(cashFlows: CashFlow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const cf of cashFlows) {
    m.set(cf.date, (m.get(cf.date) ?? 0) + cf.amount)
  }
  return m
}

function parseDate(iso: string): Date {
  // Forcer UTC pour éviter les décalages timezone qui faussent les durées
  return new Date(`${iso}T00:00:00Z`)
}

/**
 * Bissection robuste sur f. Suppose f monotone décroissant entre lo et hi
 * (ce qui est le cas pour la NPV en r > -1).
 *
 * @returns racine ou null si f(lo) et f(hi) ont le même signe (pas de racine).
 */
function bisect(
  f:        (x: number) => number,
  lo:       number,
  hi:       number,
  tol      = 1e-7,
  maxIter  = 200,
): number | null {
  let fLo = f(lo)
  let fHi = f(hi)
  if (Number.isNaN(fLo) || Number.isNaN(fHi)) return null
  if (fLo * fHi > 0) return null  // pas de changement de signe

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2
    const fMid = f(mid)
    if (Math.abs(fMid) < tol || (hi - lo) / 2 < tol) return mid
    if (fLo * fMid < 0) {
      hi = mid
      fHi = fMid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}
