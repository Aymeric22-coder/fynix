/**
 * Point d'entrée du module de simulation immobilière.
 *
 * Exemple d'usage :
 *
 *   import { runSimulation } from '@/lib/real-estate'
 *   const result = runSimulation({ property, loan, rent, charges, regime, downPayment: 20000 })
 *   console.log(result.kpis.monthlyCashFlowYear1)
 */

import { computeKPIs } from './kpis'
import { computeProjection } from './projection'
import type { SimulationInput, SimulationResult } from './types'

export function runSimulation(input: SimulationInput): SimulationResult {
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
export {
  getFiscalCalculator,
  regimeSupportsAmortization,
  regimeAllowsAcquisitionFeesDeduction,
  PRELEVEMENTS_SOCIAUX_PCT,
} from './fiscal'
export * from './types'
