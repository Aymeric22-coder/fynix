/**
 * SCI à l'IR (translucide).
 * Phase 1 : on assimile au foncier réel pour 100 % des parts (associé unique
 * ou foyer fiscal global). Le mécanisme est identique :
 *  - Charges déductibles, intérêts déductibles, pas d'amortissement
 *  - Déficit foncier 10 700 €/an sur revenu global, excédent reportable 10 ans
 *  - Imposition : (TMI + 17,2 %) sur le revenu foncier net
 *
 * La gestion fine du prorata des parts entre associés sera ajoutée en Phase 2.
 */

import { makeFoncierReelCalculator } from './foncier-reel'
import type { FiscalCalculator } from './common'

export function makeSciIrCalculator(tmiPct: number): FiscalCalculator {
  return makeFoncierReelCalculator(tmiPct)
}
