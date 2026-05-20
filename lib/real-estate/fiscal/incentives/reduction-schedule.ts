/**
 * Construit le tableau année-par-année de réduction d'impôt pour un
 * dispositif fiscal donné (Pinel / Denormandie).
 *
 * Le tableau est consommé par la projection (`incentiveReductionPerYear`)
 * qui applique : `taxPaid = max(0, taxPaid − reduction)` pour chaque année.
 *
 * Convention : la projection commence à l'année calendaire courante
 * (l'année simulée 1 = `new Date().getUTCFullYear()`).
 * - Pour les années dans la fenêtre [start_year, start_year + duration − 1],
 *   la réduction annuelle est appliquée.
 * - Hors fenêtre : 0.
 *
 * Pour les dispositifs autres que Pinel / Denormandie (Loc'Avantages,
 * Malraux, MH…) cette fonction renvoie un tableau de zéros — leur
 * mécanisme fiscal sera intégré séparément.
 */

import { computePinel, type PinelDuration, type PinelZone } from './pinel'
import { computeDenormandie } from './denormandie'
import type { PropertyInput, RentInput } from '../../types'

/** Sous-ensemble de la row property_tax_incentives utile pour cette fonction. */
export interface IncentiveScheduleRow {
  kind:           string
  duration_years: number | null
  zone:           string | null
  start_year:     number | null
  works_amount:   number | null
  is_pinel_plus:  boolean | null
}

export function buildIncentiveReductionPerYear(
  incentive:    IncentiveScheduleRow | null | undefined,
  property:     PropertyInput,
  rent:         RentInput,
  tmiPct:       number,
  horizonYears: number,
): number[] {
  if (!incentive) return []
  if (
    incentive.kind !== 'pinel' &&
    incentive.kind !== 'pinel_plus' &&
    incentive.kind !== 'denormandie'
  ) {
    return []
  }
  if (incentive.duration_years == null || incentive.start_year == null) {
    return []
  }

  const duration = incentive.duration_years as PinelDuration
  const zone     = (incentive.zone ?? 'A') as PinelZone

  // Loyer annuel HC pour la vérification d'éligibilité (sans vacance).
  const annualRentHC = rent.monthlyRent * 12

  // Calcule la réduction annuelle via Pinel ou Denormandie
  let annualReduction = 0
  if (incentive.kind === 'denormandie') {
    const r = computeDenormandie({
      duration,
      zone,
      purchasePrice: property.purchasePrice,
      worksAmount:   incentive.works_amount ?? property.worksAmount ?? 0,
      surfaceM2:     0,   // surface non requise pour le calcul de la base ici
      startYear:     incentive.start_year,
      annualRentHC,
      tmiPct,
    })
    // Si non éligible : on n'applique rien (sécurité — l'UI affichera la raison)
    annualReduction = r.eligible ? r.taxReductionPerYear : 0
  } else {
    const r = computePinel({
      isPinelPlus:   incentive.kind === 'pinel_plus' || !!incentive.is_pinel_plus,
      duration,
      zone,
      purchasePrice: property.purchasePrice,
      surfaceM2:     0,
      startYear:     incentive.start_year,
      annualRentHC,
      tmiPct,
    })
    annualReduction = r.eligible ? r.taxReductionPerYear : 0
  }

  // Construit le tableau année par année avec la fenêtre temporelle.
  // Année 1 simulée = année calendaire courante (UTC pour cohérence avec
  // amortization.ts — cf. C4 Sprint 1).
  const calendarYear1   = new Date().getUTCFullYear()
  const incentiveStart  = incentive.start_year
  const incentiveEnd    = incentiveStart + duration - 1

  return Array.from({ length: horizonYears }, (_, i) => {
    const calYear = calendarYear1 + i
    if (calYear >= incentiveStart && calYear <= incentiveEnd) {
      return annualReduction
    }
    return 0
  })
}
