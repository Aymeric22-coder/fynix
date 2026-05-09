/**
 * Comparateur réel vs simulation (Phase 2).
 *
 * Pour chaque année écoulée pour laquelle on a des données réelles,
 * calcule l'écart (variance) avec la projection théorique :
 *   - Loyers
 *   - Charges
 *   - Cash-flow net
 *   - Valorisation
 *
 * Pure fonction, déterministe. Pas d'accès DB.
 */

import type { ProjectionYear, SimulationResult } from './types'
import type { ActualYearData, ActualDataResult } from './actual'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface VarianceMetric {
  simulated:   number
  actual:      number
  /** actual − simulated (positif = mieux que prévu pour les revenus, pire pour les coûts) */
  variance:    number
  /** variance / |simulated| × 100. null si simulated = 0. */
  variancePct: number | null
}

export interface VarianceMetricNullable {
  simulated:   number
  actual:      number | null
  variance:    number | null
  variancePct: number | null
}

export interface YearComparison {
  year: number
  /** Année 1 = première année de la simulation, etc. */
  simYearIndex: number

  rent:      VarianceMetric            // loyers reçus vs loyers projetés
  charges:   VarianceMetric            // charges payées vs charges projetées
  loan:      VarianceMetric            // mensualités payées vs mensualités projetées (capital + intérêts + assurance)
  cashFlow:  VarianceMetric            // cash-flow réel vs simulé (avant impôts pour comparer apples-to-apples)
  valuation: VarianceMetricNullable    // valeur estimée à fin d'année (réelle si saisie, sinon null)
}

export interface ComparisonResult {
  years: YearComparison[]
  /** Cumul des variances sur toutes les années comparées. */
  totals: {
    rentVariance:     number
    chargesVariance:  number
    loanVariance:     number
    cashFlowVariance: number
  }
  /** 'no_data' = aucune donnée réelle ; 'partial' = certaines années ; 'tracked' = toutes les années écoulées sont remplies */
  status: 'no_data' | 'partial' | 'tracked'
  /** Nombre d'années écoulées depuis le début de la simulation (incluse). */
  elapsedYears: number
  /** Nombre d'années pour lesquelles on a au moins une donnée réelle. */
  trackedYears: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pct(num: number, denom: number): number | null {
  if (denom === 0) return null
  return (num / Math.abs(denom)) * 100
}

function metric(simulated: number, actual: number): VarianceMetric {
  const variance = actual - simulated
  return { simulated, actual, variance, variancePct: pct(variance, simulated) }
}

function metricNullable(simulated: number, actual: number | null): VarianceMetricNullable {
  if (actual === null) {
    return { simulated, actual: null, variance: null, variancePct: null }
  }
  const variance = actual - simulated
  return { simulated, actual, variance, variancePct: pct(variance, simulated) }
}

// ─── Comparator principal ──────────────────────────────────────────────────

/**
 * Compare les données réelles à la projection simulée.
 *
 * @param simulation       Résultat de runSimulation()
 * @param actual           Résultat de loadActualData()
 * @param simulationStartYear   Année calendaire de la première année de simulation
 *                              (année courante par défaut). Permet d'aligner
 *                              les ProjectionYear (1, 2, ...) avec les années
 *                              calendaires (2024, 2025, ...).
 */
export function compareActualToSimulation(
  simulation:          SimulationResult,
  actual:              ActualDataResult,
  simulationStartYear: number = new Date().getUTCFullYear(),
): ComparisonResult {
  const projection = simulation.projection
  const today = new Date()
  const elapsedYears = Math.max(0, today.getUTCFullYear() - simulationStartYear + 1)

  // Index des projections par index d'année (1, 2, ...)
  const projByIndex = new Map<number, ProjectionYear>()
  for (const y of projection) projByIndex.set(y.year, y)

  // Index des données réelles par année calendaire
  const actualByYear = new Map<number, ActualYearData>()
  for (const a of actual.years) actualByYear.set(a.year, a)

  const comparisons: YearComparison[] = []

  // Si aucune donnée réelle, on renvoie une comparaison vide (l'UI affichera un CTA).
  // Sinon, on compare toutes les années où on a soit une donnée réelle SOIT une projection passée.
  const allYears = new Set<number>()
  if (!actual.isEmpty) {
    for (const a of actual.years) allYears.add(a.year)
    for (let y = simulationStartYear; y <= simulationStartYear + elapsedYears - 1; y++) {
      allYears.add(y)
    }
  }

  for (const calendarYear of [...allYears].sort((a, b) => a - b)) {
    const simYearIndex = calendarYear - simulationStartYear + 1
    const proj         = projByIndex.get(simYearIndex)
    const act          = actualByYear.get(calendarYear)

    // Si aucune projection (année hors horizon) ET aucune donnée réelle, on skip
    if (!proj && !act) continue

    const projRent     = proj?.netRent           ?? 0   // loyer net (après vacance simulée)
    const projCharges  = proj?.charges           ?? 0
    const projLoan     = proj?.loanPayment       ?? 0
    const projCFBefore = proj?.cashFlowBeforeTax ?? 0   // on compare avant impôts (les impôts réels arrivent souvent N+1)
    const projValEnd   = proj?.estimatedValue   ?? 0

    const actRent     = act?.rentReceived       ?? 0
    const actCharges  = act?.chargesPaid.total  ?? 0
    const actLoan     = act?.loanPaid           ?? 0
    // Cash-flow réel avant impôts = loyers − charges − crédit (on exclut taxPaid pour comparabilité)
    const actCFBefore = (act?.rentReceived ?? 0) - (act?.chargesPaid.total ?? 0) - (act?.loanPaid ?? 0)
    const actValEnd   = act?.valuationAtYearEnd ?? null

    comparisons.push({
      year:         calendarYear,
      simYearIndex,
      rent:         metric(projRent, actRent),
      charges:      metric(projCharges, actCharges),
      loan:         metric(projLoan, actLoan),
      cashFlow:     metric(projCFBefore, actCFBefore),
      valuation:    metricNullable(projValEnd, actValEnd),
    })
  }

  const totals = comparisons.reduce(
    (acc, c) => ({
      rentVariance:     acc.rentVariance     + c.rent.variance,
      chargesVariance:  acc.chargesVariance  + c.charges.variance,
      loanVariance:     acc.loanVariance     + c.loan.variance,
      cashFlowVariance: acc.cashFlowVariance + c.cashFlow.variance,
    }),
    { rentVariance: 0, chargesVariance: 0, loanVariance: 0, cashFlowVariance: 0 },
  )

  const trackedYears = actual.years.length
  let status: 'no_data' | 'partial' | 'tracked' = 'no_data'
  if (trackedYears > 0 && trackedYears < elapsedYears)      status = 'partial'
  else if (trackedYears > 0 && trackedYears >= elapsedYears) status = 'tracked'

  return { years: comparisons, totals, status, elapsedYears, trackedYears }
}

// ─── Helper UI : classification d'une variance ─────────────────────────────

/**
 * Classifie une variance pour le code couleur de l'UI.
 *  - 'positive' : meilleur que prévu (revenus en hausse, charges en baisse)
 *  - 'negative' : pire que prévu
 *  - 'neutral'  : écart < seuil
 *
 * @param variance      L'écart en valeur absolue
 * @param simulated     La valeur simulée (pour calculer le %)
 * @param kind          'income' (positif = bien) ou 'expense' (négatif = bien)
 * @param thresholdPct  Seuil sous lequel l'écart est considéré neutre (défaut 5 %)
 */
export function classifyVariance(
  variance:     number,
  simulated:    number,
  kind:         'income' | 'expense',
  thresholdPct: number = 5,
): 'positive' | 'negative' | 'neutral' {
  if (simulated === 0) return variance === 0 ? 'neutral' : (kind === 'income' ? (variance > 0 ? 'positive' : 'negative') : (variance < 0 ? 'positive' : 'negative'))
  const pctVal = Math.abs(variance / simulated) * 100
  if (pctVal < thresholdPct) return 'neutral'
  if (kind === 'income')  return variance > 0 ? 'positive' : 'negative'
  /* expense */            return variance < 0 ? 'positive' : 'negative'
}
