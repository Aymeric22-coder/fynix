/**
 * Dispositif Denormandie — réduction d'impôt pour acquisition d'un
 * logement ancien avec travaux dans une commune éligible.
 *
 * Référentiel légal : CGI art. 199 novovicies (même article que Pinel).
 * Dernière mise à jour réglementaire : 2024.
 *
 * Conditions spécifiques par rapport à Pinel :
 *   - Logement ANCIEN (pas neuf)
 *   - Travaux ≥ 25 % du coût total (acquisition + travaux)
 *   - Commune éligible (liste officielle "Action Cœur de Ville" +
 *     communes avec fort besoin de réhabilitation — 222 communes)
 *
 * Taux : identiques à Pinel+ (12 / 18 / 21 % sur 6 / 9 / 12 ans).
 * Base de calcul : prix d'acquisition + travaux (toujours plafonnée
 * à 300 000 € et 5 500 €/m²).
 *
 * ⚠️ Estimation — la liste des communes éligibles et les normes de
 * travaux doivent être vérifiées avec un conseiller fiscal.
 */

import { computePinel, type PinelDuration, type PinelZone, type PinelResult } from './pinel'

/** Ratio travaux minimal exigé par le dispositif. */
export const DENORMANDIE_WORKS_MIN_RATIO = 0.25  // 25 %

export interface DenormandieParams {
  duration:        PinelDuration
  /** Zonage Pinel (la commune éligible Denormandie correspond à une zone). */
  zone:            PinelZone
  purchasePrice:   number
  /** Montant travaux TTC — distinct de works_amount de l'acquisition. */
  worksAmount:     number
  surfaceM2:       number
  startYear:       number
  annualRentHC:    number
  tmiPct:          number
}

export interface DenormandieResult extends PinelResult {
  /** Ratio travaux / (acquisition + travaux). */
  worksRatio:    number
  /** True si ratio ≥ 25 %. */
  worksEligible: boolean
  /** Travaux manquants pour atteindre 25 % (0 si OK). */
  worksGapEur:   number
}

export function computeDenormandie(params: DenormandieParams): DenormandieResult {
  const totalCost   = params.purchasePrice + params.worksAmount
  const worksRatio  = totalCost > 0 ? params.worksAmount / totalCost : 0
  const worksEligible = worksRatio >= DENORMANDIE_WORKS_MIN_RATIO
  const worksGapEur = worksEligible
    ? 0
    : (DENORMANDIE_WORKS_MIN_RATIO * totalCost) - params.worksAmount

  // Réutilise la logique Pinel+ avec base = prix + travaux
  const pinelResult = computePinel({
    isPinelPlus:   true,                  // Denormandie utilise les taux Pinel+
    duration:      params.duration,
    zone:          params.zone,
    purchasePrice: totalCost,             // base = acquisition + travaux
    surfaceM2:     params.surfaceM2,
    startYear:     params.startYear,
    annualRentHC:  params.annualRentHC,
    tmiPct:        params.tmiPct,
  })

  const ineligibilityReasons = [...pinelResult.ineligibilityReasons]
  if (!worksEligible) {
    ineligibilityReasons.push(
      `Travaux insuffisants : ${(worksRatio * 100).toFixed(1)} % du coût total ` +
      `(minimum 25 %). Il manque ${Math.round(worksGapEur)} € de travaux pour être éligible.`,
    )
  }

  return {
    ...pinelResult,
    eligible:             ineligibilityReasons.length === 0,
    ineligibilityReasons,
    worksRatio,
    worksEligible,
    worksGapEur,
  }
}
