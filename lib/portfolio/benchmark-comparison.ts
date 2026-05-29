/**
 * Comparaison de la performance du portefeuille a des indices de
 * reference (BNCH) — MSCI World, S&P 500, CAC 40.
 *
 * Module pur, browser-safe, sans Supabase. Reutilise `computeTWR` et
 * `annualizeReturn` de `analytics.ts` (un benchmark = portefeuille fictif
 * buy & hold, sans aucun cash flow).
 *
 * Convention d'unite : TOUTES les valeurs de rendement sont en
 * POURCENTAGE (ex. 12.5 = +12,5 %). L'appelant (build-from-db) convertit
 * le TWR portefeuille decimal → % avant de le passer ici.
 *
 * Tolerance bornes : si aucun prix n'existe pile a windowStart/windowEnd,
 * on prend le prix le plus proche dans une fenetre de ±TOLERANCE_DAYS.
 * Au-dela, le benchmark n'est pas calculable → `computeBenchmarkReturn`
 * retourne null (l'appelant l'exclut de la comparaison).
 */

import { computeTWR, annualizeReturn } from './analytics'

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Tolerance par defaut pour apparier une borne a un prix existant. */
export const BENCHMARK_TOLERANCE_DAYS = 5
/** Seuil d'annualisation : en dessous d'1 an, l'annualise n'a pas de sens. */
export const ANNUALIZATION_MIN_DAYS = 365

// ─── Types publics ────────────────────────────────────────────────────────

export interface PricePoint {
  /** YYYY-MM-DD */
  date:  string
  price: number
}

/** Metadonnees d'un benchmark (sans les prix). */
export interface BenchmarkMeta {
  benchmarkId:    string
  benchmarkLabel: string
  ticker:         string
}

export interface BenchmarkPerformance {
  benchmarkId:      string
  benchmarkLabel:   string
  ticker:           string
  windowStart:      string  // YYYY-MM-DD
  windowEnd:        string
  /** (priceEnd − priceStart) / priceStart, en %. */
  totalReturn:      number
  /** Rendement annualise en %. null si fenetre < 1 an. */
  annualizedReturn: number | null
}

export interface PortfolioVsBenchmark {
  portfolioTwr:           number
  portfolioAnnualizedTwr: number | null
  benchmarks:             BenchmarkPerformance[]
  windowDays:             number
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseDate(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()
}

/**
 * Cherche le prix le plus proche d'une date cible dans la tolerance.
 * @returns { price, date } du point retenu, ou null si rien dans la fenetre.
 */
function findClosestPrice(
  prices:        PricePoint[],
  targetDate:    string,
  toleranceDays: number,
): { price: number; date: string } | null {
  const targetMs = parseDate(targetDate)
  let best: { price: number; date: string } | null = null
  let bestDiffDays = Infinity
  for (const p of prices) {
    if (!(p.price > 0)) continue
    const diffDays = Math.abs(parseDate(p.date) - targetMs) / MS_PER_DAY
    if (diffDays <= toleranceDays && diffDays < bestDiffDays) {
      best = { price: p.price, date: p.date }
      bestDiffDays = diffDays
    }
  }
  return best
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Calcule le rendement d'un benchmark sur [windowStart, windowEnd].
 *
 * @returns BenchmarkPerformance, ou null si l'une des bornes n'a pas de
 *          prix dans la tolerance (benchmark non comparable sur la fenetre).
 */
export function computeBenchmarkReturn(
  meta:          BenchmarkMeta,
  prices:        PricePoint[],
  windowStart:   string,
  windowEnd:     string,
  toleranceDays: number = BENCHMARK_TOLERANCE_DAYS,
): BenchmarkPerformance | null {
  const startPoint = findClosestPrice(prices, windowStart, toleranceDays)
  const endPoint   = findClosestPrice(prices, windowEnd, toleranceDays)
  if (!startPoint || !endPoint) return null
  if (startPoint.price <= 0) return null

  // Reutilise computeTWR : benchmark = serie buy & hold sans cash flow.
  // Sur 2 points distincts → (priceEnd / priceStart) − 1 (decimal).
  const twrDec = computeTWR([
    { date: startPoint.date, value: startPoint.price },
    { date: endPoint.date,   value: endPoint.price },
  ])
  if (twrDec === null) return null

  const windowDays = (parseDate(windowEnd) - parseDate(windowStart)) / MS_PER_DAY
  const annualizedReturn =
    windowDays >= ANNUALIZATION_MIN_DAYS
      ? annualizeReturn(twrDec, windowDays) * 100
      : null

  return {
    benchmarkId:      meta.benchmarkId,
    benchmarkLabel:   meta.benchmarkLabel,
    ticker:           meta.ticker,
    windowStart,
    windowEnd,
    totalReturn:      twrDec * 100,
    annualizedReturn,
  }
}

/**
 * Assemble la comparaison portefeuille vs benchmarks. Les benchmarks
 * passes sont deja calcules (non-null) par `computeBenchmarkReturn`.
 */
export function comparePortfolioToBenchmarks(params: {
  /** TWR du portefeuille sur la fenetre, en %. */
  portfolioTwr:           number
  /** TWR annualise du portefeuille, en %. null si fenetre < 1 an. */
  portfolioAnnualizedTwr: number | null
  windowDays:             number
  benchmarks:             BenchmarkPerformance[]
}): PortfolioVsBenchmark {
  return {
    portfolioTwr:           params.portfolioTwr,
    portfolioAnnualizedTwr: params.portfolioAnnualizedTwr,
    benchmarks:             params.benchmarks,
    windowDays:             params.windowDays,
  }
}
