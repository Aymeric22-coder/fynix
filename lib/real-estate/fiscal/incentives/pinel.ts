/**
 * Dispositif Pinel et Pinel+ — réduction d'impôt sur le revenu pour
 * acquisition de logement neuf en zone tendue.
 *
 * Référentiel légal : CGI art. 199 novovicies.
 * Décret du 29 juillet 2024 (plafonds de loyer 2024).
 * Loi de finances 2023-2024 : taux Pinel classique dégradés ;
 * Pinel+ maintient les taux pleins sous conditions.
 *
 * ⚠️ Estimation — les conditions précises (ressources locataire,
 * normes RE2020, double orientation pour Pinel+) doivent être
 * vérifiées avec un conseiller fiscal.
 */

export type PinelDuration = 6 | 9 | 12
export type PinelZone     = 'A_bis' | 'A' | 'B1' | 'B2' | 'C'

/** Taux Pinel classique (LF 2024 — dégradés). */
export const PINEL_RATE_CLASSIC: Record<PinelDuration, number> = {
  6:  0.09,    // 9 %
  9:  0.12,    // 12 %
  12: 0.14,    // 14 %
}

/** Taux Pinel+ (maintien LF 2023). */
export const PINEL_RATE_PLUS: Record<PinelDuration, number> = {
  6:  0.12,
  9:  0.18,
  12: 0.21,
}

/** Plafonds de loyer HC / m² / mois — décret 2024. */
export const PINEL_RENT_CAPS_2024: Record<PinelZone, number> = {
  A_bis: 18.89,
  A:     14.03,
  B1:    11.31,
  B2:     0,    // non éligible Pinel depuis 2018
  C:      0,    // non éligible
}

/** Zones éligibles Pinel / Pinel+. */
export const PINEL_ELIGIBLE_ZONES: PinelZone[] = ['A_bis', 'A', 'B1']

/** Plafond du prix d'acquisition retenu. */
export const PINEL_PRICE_CAP        = 300_000
export const PINEL_PRICE_PER_M2_CAP = 5_500

/** Plafond global niches fiscales (CGI art. 200-0 A). */
export const GLOBAL_TAX_NICHE_CAP = 10_000

export interface PinelParams {
  isPinelPlus:    boolean
  duration:       PinelDuration
  zone:           PinelZone
  purchasePrice:  number        // prix acquisition TTC
  surfaceM2:      number
  startYear:      number        // 1ère mise en location
  annualRentHC:   number        // loyer annuel effectif (12 × mensuel)
  tmiPct:         number
}

export interface PinelResult {
  eligible:               boolean
  ineligibilityReasons:   string[]

  taxReductionTotal:      number   // réduction totale (durée complète)
  taxReductionPerYear:    number   // réduction annuelle
  effectiveBase:          number   // base retenue (min prix / plafonds)

  rentCapMonthlyPerM2:    number
  rentCapMonthlyTotal:    number   // plafond mensuel HC pour le logement
  rentIsCompliant:        boolean
  rentGapMonthlyEur:      number   // écart mensuel si non conforme

  yearByYear: Array<{
    year:        number
    reductionIR: number
    capped:      boolean   // si > plafond niches 10 000 €
  }>

  warningNichesCap:       boolean
}

/**
 * Coefficient de pondération du plafond de loyer Pinel.
 *
 * Formule réglementaire (BOI-IR-RICI-360) :
 *   coef = 0,7 + (19 / surface_utile)
 *   plafonné à 1,2
 *
 * Le loyer plafond = (plafond €/m²) × surface utile × coef.
 */
export function pinelRentCoefficient(surfaceM2: number): number {
  if (surfaceM2 <= 0) return 0
  return Math.min(1.2, 0.7 + 19 / surfaceM2)
}

export function computePinel(params: PinelParams): PinelResult {
  const reasons: string[] = []

  // 1. Zone
  if (!PINEL_ELIGIBLE_ZONES.includes(params.zone)) {
    reasons.push(
      `Zone ${params.zone} non éligible Pinel (uniquement A bis / A / B1 depuis 2018).`,
    )
  }
  // 2. Surface > 0
  if (params.surfaceM2 <= 0) {
    reasons.push('Surface du logement requise pour le calcul du plafond de loyer.')
  }

  // 3. Base de calcul (double plafonnement : 300 000 € et 5 500 €/m²)
  const priceCap     = Math.min(params.purchasePrice, PINEL_PRICE_CAP)
  const priceM2Cap   = params.surfaceM2 * PINEL_PRICE_PER_M2_CAP
  const effectiveBase = Math.min(priceCap, priceM2Cap)

  // 4. Taux et réduction
  const rates = params.isPinelPlus ? PINEL_RATE_PLUS : PINEL_RATE_CLASSIC
  const totalRate = rates[params.duration]
  const taxReductionTotal   = effectiveBase * totalRate
  const taxReductionPerYear = params.duration > 0 ? taxReductionTotal / params.duration : 0

  // 5. Plafond loyer mensuel
  const rentCapPerM2  = PINEL_RENT_CAPS_2024[params.zone] ?? 0
  const coef          = pinelRentCoefficient(params.surfaceM2)
  const rentCapMonthlyTotal = rentCapPerM2 * params.surfaceM2 * coef
  const annualRentCap = rentCapMonthlyTotal * 12
  const rentIsCompliant = params.annualRentHC <= annualRentCap
  const rentGapMonthlyEur = rentIsCompliant
    ? 0
    : (params.annualRentHC - annualRentCap) / 12

  if (!rentIsCompliant && params.surfaceM2 > 0 && PINEL_ELIGIBLE_ZONES.includes(params.zone)) {
    reasons.push(
      `Loyer trop élevé : ${Math.round(params.annualRentHC)} €/an > plafond ` +
      `${Math.round(annualRentCap)} €/an. Réduisez de ${Math.round(rentGapMonthlyEur)} €/mois.`,
    )
  }

  // 6. Détail année par année + plafond niches fiscales
  const yearByYear = Array.from({ length: params.duration }, (_, i) => {
    const capped = taxReductionPerYear > GLOBAL_TAX_NICHE_CAP
    return {
      year:        params.startYear + i,
      reductionIR: Math.min(taxReductionPerYear, GLOBAL_TAX_NICHE_CAP),
      capped,
    }
  })

  return {
    eligible:             reasons.length === 0,
    ineligibilityReasons: reasons,
    taxReductionTotal,
    taxReductionPerYear,
    effectiveBase,
    rentCapMonthlyPerM2:  rentCapPerM2,
    rentCapMonthlyTotal,
    rentIsCompliant,
    rentGapMonthlyEur,
    yearByYear,
    warningNichesCap:     taxReductionPerYear > GLOBAL_TAX_NICHE_CAP,
  }
}
