/**
 * Dispositif Loc'Avantages (ex-Cosse).
 *
 * Référentiel légal : CGI art. 199 tricies, BOI-IR-RICI-365.
 * Dernière mise à jour réglementaire : 2023.
 *
 * Réduction d'impôt en échange d'un loyer plafonné sous convention
 * ANAH. Trois niveaux selon l'ampleur de la décote vs marché :
 *   - Loc1 : décote ≥ 15 % → réduction 15 % des loyers perçus
 *   - Loc2 : décote ≥ 30 % → réduction 35 %
 *   - Loc3 : décote ≥ 45 % (intermédiation sociale obligatoire) → 65 %
 *
 * Conditions :
 *   - Location nue uniquement (pas de meublé)
 *   - Durée de convention ANAH minimale : 6 ans
 *   - Bien situé en zone A bis / A / B1 / B2
 *   - Plafond de ressources locataire (non vérifié ici — à valider
 *     avec l'ANAH)
 *
 * ⚠️ Estimation — la décote, la durée et les ressources locataire
 * doivent être vérifiées avec votre conseiller fiscal ou l'ANAH.
 */

export type LocAvantagesConvention = 'loc1' | 'loc2' | 'loc3'

/** Taux de réduction d'IR appliqué sur les loyers perçus annuels. */
export const LOC_AVANTAGES_RATES: Record<LocAvantagesConvention, number> = {
  loc1: 0.15,
  loc2: 0.35,
  loc3: 0.65,
}

/** Décote loyer minimale vs marché exigée par chaque convention. */
export const LOC_AVANTAGES_RENT_DISCOUNT: Record<LocAvantagesConvention, number> = {
  loc1: 0.15,
  loc2: 0.30,
  loc3: 0.45,
}

export const LOC_AVANTAGES_MIN_DURATION_YEARS = 6

export interface LocAvantagesParams {
  convention:          LocAvantagesConvention
  annualRentHC:        number        // loyer annuel réellement perçu
  marketRentAnnual:    number        // loyer marché — pour vérifier la décote
  conventionStartDate: Date
  conventionEndDate:   Date
  tmiPct:              number
}

export interface LocAvantagesResult {
  eligible:             boolean
  ineligibilityReasons: string[]

  convention:           LocAvantagesConvention
  reductionRate:        number
  annualTaxReduction:   number       // loyer perçu × taux
  totalTaxReduction:    number       // sur durée totale convention

  rentDiscountActual:   number       // décote réelle vs marché (0–1)
  rentDiscountRequired: number       // décote requise (0–1)
  rentIsCompliant:      boolean
  rentReductionNeededEur: number     // baisse loyer nécessaire pour conformité

  conventionDurationYears: number
  yearsRemaining:       number

  /**
   * Gain net vs location libre :
   *   réduction IR annuelle − manque à gagner sur les loyers
   * Positif : Loc'Avantages avantageux. Négatif : libre plus rentable.
   */
  netGainVsFreeLetting: number
}

export function computeLocAvantages(params: LocAvantagesParams): LocAvantagesResult {
  const reasons: string[] = []

  // Durée de la convention
  const conventionDurationYears = Math.max(
    0,
    Math.round(
      (params.conventionEndDate.getTime() - params.conventionStartDate.getTime())
      / (1000 * 60 * 60 * 24 * 365.25),
    ),
  )

  // Décote réelle vs marché
  const rentDiscountRequired = LOC_AVANTAGES_RENT_DISCOUNT[params.convention]
  const rentDiscountActual   = params.marketRentAnnual > 0
    ? (params.marketRentAnnual - params.annualRentHC) / params.marketRentAnnual
    : 0
  const rentIsCompliant = rentDiscountActual >= rentDiscountRequired

  // Baisse de loyer nécessaire (par an) pour atteindre la décote exigée
  const targetRent = params.marketRentAnnual * (1 - rentDiscountRequired)
  const rentReductionNeededEur = rentIsCompliant
    ? 0
    : Math.max(0, params.annualRentHC - targetRent)

  if (!rentIsCompliant) {
    reasons.push(
      `Décote insuffisante : ${(rentDiscountActual * 100).toFixed(1)} % ` +
      `(minimum ${(rentDiscountRequired * 100).toFixed(0)} % pour ${params.convention}). ` +
      `Réduisez le loyer de ${Math.round(rentReductionNeededEur)} €/an pour être éligible.`,
    )
  }

  if (conventionDurationYears < LOC_AVANTAGES_MIN_DURATION_YEARS) {
    reasons.push(
      `Durée de convention insuffisante : ${conventionDurationYears} an(s) (minimum 6 ans).`,
    )
  }

  // Années restantes
  const today = new Date()
  const yearsRemaining = Math.max(
    0,
    Math.round(
      (params.conventionEndDate.getTime() - today.getTime())
      / (1000 * 60 * 60 * 24 * 365.25),
    ),
  )

  const reductionRate      = LOC_AVANTAGES_RATES[params.convention]
  const annualTaxReduction = params.annualRentHC * reductionRate
  const totalTaxReduction  = annualTaxReduction * conventionDurationYears

  // Gain net annuel vs location libre :
  //   loyer libre = marketRent ; sous-loyer convention = annualRentHC
  //   manque à gagner brut = market − percu
  //   gain net = réduction IR − manque à gagner
  const annualRentLoss     = Math.max(0, params.marketRentAnnual - params.annualRentHC)
  const netGainVsFreeLetting = annualTaxReduction - annualRentLoss

  return {
    eligible:             reasons.length === 0,
    ineligibilityReasons: reasons,
    convention:           params.convention,
    reductionRate,
    annualTaxReduction,
    totalTaxReduction,
    rentDiscountActual,
    rentDiscountRequired,
    rentIsCompliant,
    rentReductionNeededEur,
    conventionDurationYears,
    yearsRemaining,
    netGainVsFreeLetting,
  }
}
