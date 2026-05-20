/**
 * Detection automatique du regime fiscal optimal pour un loueur en
 * meuble courte duree (LF 2025).
 *
 * Compare :
 *  - Micro-BIC (abattement forfaitaire selon classement)
 *  - Reel (charges + amortissements deductibles)
 *
 * Et signale le basculement obligatoire si le plafond du micro est
 * depasse.
 *
 * Sources :
 *  - CGI art. 50-0 (micro-BIC, modifie par LF 2025 art. 41)
 *  - BOI-BIC-DECLA-10
 *  - LF 2025 art. 41 (nouveaux taux et plafonds tourisme)
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from '../fiscal/common'
import type { TourismClassification } from '@/types/database.types'

/**
 * Bareme LF 2025 pour les meubles de tourisme et chambres d'hotes.
 * Source : CGI art. 50-0 modifie + BOI-BIC-DECLA-10.
 */
export const SHORT_TERM_MICRO_BIC_REGIMES: Record<
  TourismClassification,
  { abattement: number; plafond: number; label: string }
> = {
  non_classe: {
    abattement: 0.30,
    plafond:    15_000,
    label:      'Non classé',
  },
  classe_1_2: {
    abattement: 0.50,
    plafond:    77_700,
    label:      'Classé 1-2 étoiles',
  },
  classe_3_4_5: {
    abattement: 0.50,
    plafond:    77_700,
    label:      'Classé 3-4-5 étoiles',
  },
  chambre_hotes: {
    abattement: 0.71,
    plafond:    188_700,
    label:      'Chambre d’hôtes',
  },
}

export interface ShortTermFiscalDetectionInput {
  /** CA brut annuel estime (loyers + frais menage refactures voyageur). */
  estimatedCA:             number
  /** Classement Atout France (pilote l'abattement micro-BIC). */
  classification:          TourismClassification
  /** Tranche marginale d'imposition (%, ex. 30). */
  tmiPct:                  number
  /** Charges deductibles annuelles estimees (regime reel). */
  estimatedCharges:        number
  /** Amortissements annuels estimes (LMNP reel : bati + mobilier + travaux). */
  estimatedAmortissement:  number
}

export interface ShortTermFiscalDetectionResult {
  classification:          TourismClassification
  classificationLabel:     string
  abattementPct:           number   // 0-100
  plafondCA:               number
  estimatedCA:             number

  isUnderPlafond:          boolean
  depassementEur:          number
  forcedRealRegime:        boolean

  // Impots calcules
  microBicTax:             number
  reelEstimatedTax:        number

  // Comparaison net apres impot
  microNetAfterTax:        number
  reelNetAfterTax:         number
  gainSwitchingToReel:     number    // positif si reel plus avantageux

  recommendedRegime:       'micro' | 'reel'
  recommendation:          string
}

/**
 * Detecte le regime micro-BIC vs reel optimal.
 *
 * Logique :
 *  - Si CA > plafond micro => regime reel obligatoire (forcedRealRegime).
 *  - Sinon : compare micro vs reel sur le net apres impot et recommande
 *    le plus avantageux. Seuil de switch : 500 EUR/an (sous ce seuil
 *    on conserve le micro pour sa simplicite).
 *
 * Cotisations sociales : 17,2 % de PS sur la base imposable BIC non
 * professionnelle (cas standard LMNP). LMP relevant des cotisations
 * sociales SSI (~35 %) — geres par le calculateur LMP existant.
 */
export function detectShortTermFiscalRegime(
  input: ShortTermFiscalDetectionInput,
): ShortTermFiscalDetectionResult {
  const regime = SHORT_TERM_MICRO_BIC_REGIMES[input.classification]

  const isUnderPlafond   = input.estimatedCA <= regime.plafond
  const depassementEur   = Math.max(0, input.estimatedCA - regime.plafond)
  const forcedRealRegime = !isUnderPlafond

  // Impot micro
  const microBase    = input.estimatedCA * (1 - regime.abattement)
  const microTaxRate = (input.tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100
  const microBicTax  = microBase * microTaxRate

  // Impot reel (deficit => 0, report 10 ans non comptabilise ici)
  const reelBase = Math.max(0,
    input.estimatedCA - input.estimatedCharges - input.estimatedAmortissement,
  )
  const reelEstimatedTax = reelBase * microTaxRate

  const microNet = input.estimatedCA - microBicTax
  // En reel, le proprio paye aussi les charges deductibles (sortie de cash)
  const reelNet  = input.estimatedCA - input.estimatedCharges - reelEstimatedTax
  const gain     = reelNet - microNet

  let recommendedRegime: 'micro' | 'reel'
  let recommendation: string

  if (forcedRealRegime) {
    recommendedRegime = 'reel'
    recommendation =
      `CA estimé (${formatEur(input.estimatedCA)}) > plafond micro ` +
      `(${formatEur(regime.plafond)}). Régime réel obligatoire.`
  } else if (gain > 500) {
    recommendedRegime = 'reel'
    recommendation =
      `Le régime réel vous économise ~${formatEur(gain)}/an vs micro ` +
      `(charges + amortissements). Nécessite un expert-comptable (déductible).`
  } else if (gain < -500) {
    recommendedRegime = 'micro'
    recommendation =
      `Le micro-BIC (abattement ${(regime.abattement * 100).toFixed(0)} %) ` +
      `est plus avantageux que le réel dans votre situation ` +
      `(~${formatEur(-gain)}/an de mieux).`
  } else {
    recommendedRegime = 'micro'
    recommendation =
      `Micro-BIC et réel donnent un résultat proche. Le micro-BIC ` +
      `(abattement ${(regime.abattement * 100).toFixed(0)} %) reste plus ` +
      `simple à déclarer.`
  }

  return {
    classification:      input.classification,
    classificationLabel: regime.label,
    abattementPct:       regime.abattement * 100,
    plafondCA:           regime.plafond,
    estimatedCA:         input.estimatedCA,
    isUnderPlafond,
    depassementEur,
    forcedRealRegime,
    microBicTax,
    reelEstimatedTax,
    microNetAfterTax:    microNet,
    reelNetAfterTax:     reelNet,
    gainSwitchingToReel: gain,
    recommendedRegime,
    recommendation,
  }
}

function formatEur(v: number): string {
  return `${Math.round(v).toLocaleString('fr-FR')} €`
}
