/**
 * Point d'entrée du module de simulation immobilière.
 *
 * Exemple d'usage :
 *
 *   import { runSimulation } from '@/lib/real-estate'
 *   const result = runSimulation({ property, loan, rent, charges, regime, downPayment: 20000 })
 *   if (result.incompleteData) {
 *     // afficher état "Données incomplètes" + CTA
 *   } else {
 *     console.log(result.kpis.monthlyCashFlowYear1)
 *   }
 */

import { computeKPIs } from './kpis'
import { computeProjection } from './projection'
import { validateSimulationInput } from './validate'
import type {
  PropertyKPIs,
  RawSimulationInput,
  SimulationInput,
  SimulationResult,
} from './types'

/**
 * KPIs nuls (utilisés en fallback quand les données sont incomplètes).
 * Tous les champs sont à 0 / null pour ne pas afficher de chiffres trompeurs.
 */
function emptyKPIs(downPayment: number): PropertyKPIs {
  return {
    totalCost:                0,
    borrowedAmount:           0,
    downPayment:              downPayment ?? 0,
    monthlyPayment:           0,
    monthlyInsurance:         0,
    grossYieldOnPrice:        0,
    grossYieldFAI:            0,
    netYield:                 0,
    netNetYield:              0,
    monthlyCashFlowYear1:     0,
    annualCashFlowYear1:      0,
    currentNetPropertyValue:  0,
    leverageRatio:            0,
    paybackYear:              null,
  }
}

/**
 * Lance une simulation à partir d'un input potentiellement partiel.
 *
 * Si des champs critiques manquent (typiquement un crédit DB pas encore
 * complété), renvoie un résultat avec `incompleteData: true`, projection vide
 * et KPIs nuls. L'UI peut détecter ce flag pour afficher un état dégradé.
 *
 * Si l'input est complet, calcule normalement la projection et les KPIs.
 *
 * Accepte aussi un `SimulationInput` strict (rétro-compatible).
 */
export function runSimulation(rawInput: RawSimulationInput | SimulationInput): SimulationResult {
  const validation = validateSimulationInput(rawInput as RawSimulationInput)

  if (!validation.ok) {
    return {
      amortization:  null,
      projection:    [],
      kpis:          emptyKPIs(rawInput.downPayment),
      incompleteData: true,
      missingFields:  validation.missingFields,
    }
  }

  const input: SimulationInput = validation.input
  const { amortization, projection } = computeProjection(input)
  const kpis = computeKPIs(input, amortization, projection)

  return { amortization, projection, kpis }
}

// Réexports utiles
export {
  buildAmortizationSchedule,
  computeMonthlyPayment,
  computeRemainingCapitalAt,
} from './amortization'
export { computeProjection } from './projection'
export { computeKPIs }       from './kpis'
export { validateSimulationInput } from './validate'
export type { ValidationResult }   from './validate'
export {
  getFiscalCalculator,
  regimeSupportsAmortization,
  regimeAllowsAcquisitionFeesDeduction,
  PRELEVEMENTS_SOCIAUX_PCT,
} from './fiscal'
export * from './types'
export { buildSimulationInputFromDb } from './build-from-db'
export type { DbProperty, DbDebt, DbLot, DbCharges, DbProfile } from './build-from-db'
