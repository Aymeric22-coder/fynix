/**
 * Charges immobilières par défaut — estimations conservatrices françaises.
 *
 * Servent à pré-remplir le formulaire de saisie des charges annuelles
 * quand l'utilisateur n'a pas encore renseigné de chiffres précis pour
 * son bien. Les ratios sont volontairement prudents (légèrement
 * surestimés) pour ne pas survendre le rendement net.
 *
 * Source / repères :
 *   - Taxe foncière : ~0,5–1,2 % du prix d'achat selon les communes.
 *     Médiane nationale ≈ 0,8 %.
 *   - Assurance PNO  : ~0,3–0,5 % du prix d'achat selon la zone et
 *     la couverture. Retenu 0,4 %.
 *   - Entretien      : 1 % du prix d'achat / an est le ratio
 *     "Stessa-style" classique anglo-saxon, légèrement conservateur
 *     pour la France.
 *   - Vacance        : 5 % ≈ 2,5 semaines de vacance par an, valeur
 *     standard sur des biens bien situés.
 *
 * Toutes les valeurs renvoyées sont annuelles et en euros (sauf
 * vacancy_pct qui est en points de %).
 */

export interface DefaultCharges {
  /** Taxe foncière annuelle estimée (€). */
  taxe_fonciere:    number
  /** Assurance Propriétaire Non Occupant annuelle estimée (€). */
  insurance_pno:    number
  /** Budget entretien / petites réparations annuel estimé (€). */
  maintenance:      number
  /** Taux de vacance locative annuel en points de pourcentage (0-100). */
  vacancy_pct:      number
}

/** Ratios appliqués au prix d'achat pour estimer les charges (1 = 100 %). */
export const DEFAULT_CHARGES_RATIOS = {
  TAXE_FONCIERE: 0.008,    // 0,8 %
  INSURANCE_PNO: 0.004,    // 0,4 %
  MAINTENANCE:   0.01,     // 1 %
  VACANCY_PCT:   5,        // 5 %
} as const

/**
 * Calcule les charges par défaut à partir du prix d'achat d'un bien.
 * Si `purchase_price` est nul, négatif ou null → renvoie tous les
 * montants à 0 (mais conserve le vacancy_pct par défaut).
 */
export function getDefaultCharges(purchase_price: number | null | undefined): DefaultCharges {
  const price = Math.max(0, purchase_price ?? 0)
  if (price <= 0) {
    return {
      taxe_fonciere: 0,
      insurance_pno: 0,
      maintenance:   0,
      vacancy_pct:   DEFAULT_CHARGES_RATIOS.VACANCY_PCT,
    }
  }
  return {
    taxe_fonciere: Math.round(price * DEFAULT_CHARGES_RATIOS.TAXE_FONCIERE),
    insurance_pno: Math.round(price * DEFAULT_CHARGES_RATIOS.INSURANCE_PNO),
    maintenance:   Math.round(price * DEFAULT_CHARGES_RATIOS.MAINTENANCE),
    vacancy_pct:   DEFAULT_CHARGES_RATIOS.VACANCY_PCT,
  }
}
