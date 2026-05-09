/**
 * Forecast révisé (Phase 2).
 *
 * Construit une projection mixte :
 *  - Années passées : remplacées par les valeurs réelles cumulées
 *  - Année courante : pivot, cumulativeCashFlow recalibré
 *  - Années futures : conservent la simulation, mais cumulativeCashFlow
 *    repart du réel cumulé
 *
 * Permet à l'utilisateur de voir "si je continue à cette allure, où vais-je
 * arriver dans 10 ans ?" avec le drift accumulé déjà intégré.
 *
 * Pure fonction — pas d'accès DB.
 */

import type { ProjectionYear, SimulationResult } from './types'
import type { ActualDataResult } from './actual'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RevisedProjectionYear extends ProjectionYear {
  /** Source des données : 'actual' (passé suivi), 'pivot' (année courante), 'forecast' (futur). */
  source: 'actual' | 'pivot' | 'forecast'
}

export interface RevisedForecastResult {
  /** Projection mixte réel + futur (longueur ≤ celle de la simulation originale). */
  projection:           RevisedProjectionYear[]
  /** Cumul réel à la date du pivot (avant projection future). */
  cumulRealAtPivot:     number
  /** Cumul prévu par la simulation originale au même pivot. */
  cumulSimulatedAtPivot: number
  /** Écart cumulé à date (réel - simulé). Positif = mieux que prévu. */
  drift:                number
  /** Année calendaire du pivot (= année courante en pratique). */
  pivotYear:            number
  /** Patrimoine net final révisé (valeur estimée - capital restant) à fin d'horizon. */
  finalNetValue:        number
  /** Patrimoine net final original (sim non révisée) à fin d'horizon. */
  finalNetValueOriginal: number
  /** Nombre d'années passées intégrées au revised forecast. */
  elapsedYears:         number
  /** True si aucune donnée réelle (alors la révision est égale à la simulation). */
  isEmpty:              boolean
}

// ─── Helper principal ───────────────────────────────────────────────────────

/**
 * Recompose une projection en remplaçant les années passées par les valeurs réelles
 * et en propageant l'écart cumulé sur les années futures.
 *
 * @param simulation         La simulation d'origine (paramètres DB).
 * @param actual             Les données réelles agrégées.
 * @param simulationStartYear   Année calendaire de la première année de projection (year 1).
 * @param pivotDate          Date pivot (défaut : aujourd'hui). On considère "passées"
 *                           toutes les années dont l'index est < pivot - startYear + 1.
 */
export function computeRevisedForecast(
  simulation:          SimulationResult,
  actual:              ActualDataResult,
  simulationStartYear: number = new Date().getUTCFullYear(),
  pivotDate:           Date   = new Date(),
): RevisedForecastResult {
  const pivotYear = pivotDate.getUTCFullYear()
  const elapsedYears = Math.max(0, pivotYear - simulationStartYear + 1)

  // Cas trivial : pas de données réelles → revised = simulation
  if (actual.isEmpty || simulation.projection.length === 0) {
    const last = simulation.projection[simulation.projection.length - 1]
    return {
      projection:            simulation.projection.map((p) => ({ ...p, source: 'forecast' as const })),
      cumulRealAtPivot:      0,
      cumulSimulatedAtPivot: 0,
      drift:                 0,
      pivotYear,
      finalNetValue:         last?.netPropertyValue ?? 0,
      finalNetValueOriginal: last?.netPropertyValue ?? 0,
      elapsedYears:          0,
      isEmpty:               true,
    }
  }

  // Index réel par année calendaire
  const actualByYear = new Map<number, typeof actual.years[number]>()
  for (const a of actual.years) actualByYear.set(a.year, a)

  // Cumul réel à la date du pivot (sur années écoulées strictement passées)
  let cumulReal = -((simulation.projection[0]?.cashFlowAfterTax ?? 0) - (simulation.projection[0]?.cashFlowBeforeTax ?? 0))
  // Note : on initialise cumulReal à 0 + apport (le `cumulativeCashFlow` simulé inclut l'apport en négatif)
  // Pour aligner correctement, on prend le cumul simulé de l'année 0 comme base
  cumulReal = simulation.projection[0]?.cumulativeCashFlow !== undefined
    ? simulation.projection[0].cumulativeCashFlow - simulation.projection[0].cashFlowAfterTax  // = apport en négatif
    : 0

  for (let i = 1; i <= elapsedYears - 1 && i <= simulation.projection.length; i++) {
    const calYear = simulationStartYear + (i - 1)
    const act = actualByYear.get(calYear)
    if (act) {
      // CF réel avant impôts (les impôts arrivent en N+1 et ne sont pas comparés ici)
      const cfReal = act.rentReceived - act.chargesPaid.total - act.loanPaid - act.taxPaid - act.feesPaid
      cumulReal += cfReal
    } else {
      // Année non suivie : on prend la simulation comme fallback
      const projY = simulation.projection[i - 1]
      cumulReal += projY?.cashFlowAfterTax ?? 0
    }
  }

  // Cumul simulé à la même position (juste avant l'année pivot)
  const cumulSimAtPivot = elapsedYears >= 2
    ? (simulation.projection[elapsedYears - 2]?.cumulativeCashFlow ?? 0)
    : (simulation.projection[0]?.cumulativeCashFlow ?? 0) - (simulation.projection[0]?.cashFlowAfterTax ?? 0)

  const drift = cumulReal - cumulSimAtPivot

  // Construction de la projection révisée
  const revised: RevisedProjectionYear[] = []
  let runningCumul = cumulReal

  for (let i = 0; i < simulation.projection.length; i++) {
    const proj = simulation.projection[i]!
    const calYear = simulationStartYear + i
    let source: RevisedProjectionYear['source']
    let cashFlowYear: number
    let estimatedValue: number = proj.estimatedValue
    let remainingCapital: number = proj.remainingCapital

    if (calYear < pivotYear) {
      // ── Passé : on intègre le réel ──
      source = 'actual'
      const act = actualByYear.get(calYear)
      if (act) {
        cashFlowYear = act.rentReceived - act.chargesPaid.total - act.loanPaid - act.taxPaid - act.feesPaid
        if (act.valuationAtYearEnd !== null) estimatedValue = act.valuationAtYearEnd
      } else {
        cashFlowYear = proj.cashFlowAfterTax
      }
      // remainingCapital : on garde la simulation (analytique correct)
    } else if (calYear === pivotYear) {
      source = 'pivot'
      // Pour l'année courante, on bascule sur la projection (en cours)
      cashFlowYear = proj.cashFlowAfterTax
      // Valuation : si déjà saisie pour l'année, on l'utilise
      const act = actualByYear.get(calYear)
      if (act?.valuationAtYearEnd !== null && act?.valuationAtYearEnd !== undefined) {
        estimatedValue = act.valuationAtYearEnd
      }
    } else {
      // ── Futur : projection conservée, cumul recalibré ──
      source = 'forecast'
      cashFlowYear = proj.cashFlowAfterTax
    }

    // Recalcul du cumul (on additionne année après année à partir du runningCumul)
    if (i === 0 || calYear === simulationStartYear) {
      // Première année : cumul = (apport négatif déjà dans la sim) + cashflow réel/projeté
      const apportInit = (proj.cumulativeCashFlow ?? 0) - proj.cashFlowAfterTax
      runningCumul = apportInit + cashFlowYear
    } else {
      runningCumul += cashFlowYear
    }

    revised.push({
      ...proj,
      cashFlowAfterTax:    cashFlowYear,
      cumulativeCashFlow:  runningCumul,
      estimatedValue,
      remainingCapital,
      netPropertyValue:    estimatedValue - remainingCapital,
      source,
    })
  }

  const last         = revised[revised.length - 1]
  const lastOriginal = simulation.projection[simulation.projection.length - 1]

  return {
    projection:            revised,
    cumulRealAtPivot:      cumulReal,
    cumulSimulatedAtPivot: cumulSimAtPivot,
    drift,
    pivotYear,
    finalNetValue:         last?.netPropertyValue ?? 0,
    finalNetValueOriginal: lastOriginal?.netPropertyValue ?? 0,
    elapsedYears,
    isEmpty:               false,
  }
}
