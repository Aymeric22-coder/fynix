/**
 * Régime Monuments Historiques.
 *
 * Référentiel légal : CGI art. 156 I-3°, BOI-RFPI-SPEC-30.
 * Dernière mise à jour réglementaire : 2024.
 *
 * Niche fiscale parmi les plus puissantes du droit français :
 *   - Déduction de 100 % des travaux de restauration sur le revenu
 *     global (sans plafond — non soumis au plafonnement de 10 000 €
 *     des niches fiscales, CGI art. 200-0 A).
 *   - Trois statuts : Classé MH / Inscrit ISMH / Agréé Ministère
 *     de la Culture.
 *   - Engagement de conservation 15 ans minimum.
 *   - Deux situations :
 *       * Propriétaire occupant : 100 % travaux déductibles
 *         revenu global.
 *       * Propriétaire bailleur : 100 % travaux + charges
 *         foncières déductibles.
 *
 * ⚠️ Estimation — le statut MH/ISMH/agréé et la conformité des
 * travaux doivent être validés par la DRAC avant tout chantier.
 */

export type MhClassification = 'classe' | 'inscrit' | 'agree'
export type MhOccupancy      = 'owner_occupied' | 'rented' | 'mixed'

export const MH_CLASSIFICATION_LABELS: Record<MhClassification, string> = {
  classe:  'Classé Monument Historique',
  inscrit: "Inscrit à l'ISMH (Inventaire Supplémentaire)",
  agree:   "Agréé par le Ministère de la Culture",
}

export interface MhParams {
  classification:      MhClassification
  occupancy:           MhOccupancy
  worksAmount:         number    // travaux de restauration TTC
  annualCharges:       number    // charges courantes (si bailleur)
  annualRentHC:        number    // loyers (si bailleur ou mixte)
  acquisitionYear:     number
  /** Engagement 15 ans à partir de l'acquisition. */
  conservationEndYear: number
  tmiPct:              number
}

export interface MhResult {
  eligible:                boolean
  ineligibilityReasons:    string[]

  deductibleWorks:         number   // 100 % travaux
  deductibleCharges:       number   // charges (si bailleur)
  totalDeductible:         number

  taxSavingWorks:          number   // travaux × TMI
  taxSavingCharges:        number   // charges × TMI
  totalTaxSaving:          number

  /** Économie effective sur travaux = totalTaxSaving / worksAmount. */
  effectiveRate:           number
  conservationYearsLeft:   number
  notSubjectToNichesCap:   true     // MH n'est jamais plafonné

  warning15Years:          boolean  // engagement < 3 ans restants
}

export function computeMH(params: MhParams): MhResult {
  const reasons: string[] = []
  const today = new Date().getFullYear()
  const conservationYearsLeft = params.conservationEndYear - today

  if (conservationYearsLeft < 0) {
    reasons.push(
      `Période de conservation expirée en ${params.conservationEndYear}.`,
    )
  }

  // 100 % des travaux toujours déductibles
  const deductibleWorks   = Math.max(0, params.worksAmount)
  // Charges déductibles si bailleur ou mixte (uniquement la part louée
  // en théorie, mais simplification ici : tout sauf occupant pur)
  const deductibleCharges = params.occupancy !== 'owner_occupied'
    ? Math.max(0, params.annualCharges)
    : 0
  const totalDeductible = deductibleWorks + deductibleCharges

  // Économie fiscale = déduction × TMI (imputation revenu global ou foncier)
  const taxSavingWorks   = deductibleWorks   * (params.tmiPct / 100)
  const taxSavingCharges = deductibleCharges * (params.tmiPct / 100)
  const totalTaxSaving   = taxSavingWorks + taxSavingCharges

  return {
    eligible:             reasons.length === 0,
    ineligibilityReasons: reasons,
    deductibleWorks,
    deductibleCharges,
    totalDeductible,
    taxSavingWorks,
    taxSavingCharges,
    totalTaxSaving,
    effectiveRate: params.worksAmount > 0
      ? totalTaxSaving / params.worksAmount
      : 0,
    conservationYearsLeft: Math.max(0, conservationYearsLeft),
    notSubjectToNichesCap: true,
    warning15Years: conservationYearsLeft >= 0 && conservationYearsLeft < 3,
  }
}
