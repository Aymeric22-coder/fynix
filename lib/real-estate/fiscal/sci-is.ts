/**
 * SCI à l'IS.
 * - Toutes charges déductibles (intérêts, assurance, PNO, GLI, TF, CFE, comptable, copro, gestion, maintenance, autres)
 * - Amortissements : bâti (hors terrain) + travaux + mobilier
 * - Frais d'acquisition : passés en charges A1 (par défaut) ou amortis (selon `acquisitionFeesTreatment`)
 * - IS : 15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà
 * - Déficit reportable indéfiniment, imputable uniquement sur les bénéfices futurs de la SCI
 */

import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

/** Calcul de l'IS avec les seuils 2024+ */
export function computeIS(taxableBase: number): number {
  if (taxableBase <= 0) return 0
  const lower  = Math.min(taxableBase, 42_500) * 0.15
  const upper  = Math.max(0, taxableBase - 42_500) * 0.25
  return lower + upper
}

export const calculateSciIs: FiscalCalculator = (
  inputs: YearAccountingInputs,
  state:  CarryForwardState,
): YearTaxOutput => {
  const totalCharges =
    inputs.pno + inputs.gli + inputs.propertyTax + inputs.cfe +
    inputs.accountant + inputs.condoFees + inputs.management +
    inputs.maintenance + inputs.other

  const totalAmort = inputs.amortBuilding + inputs.amortWorks + inputs.amortFurniture

  const fiscalResult =
    inputs.netRent
    - totalCharges
    - inputs.loanInterest
    - inputs.loanInsurance
    - totalAmort
    - inputs.exceptionalFees

  // Imputation du déficit reporté
  const carriedBefore = state.isDeficitCarried   // ≤ 0 (déficit) ou 0
  const baseAfterCarry = fiscalResult + carriedBefore

  let newCarried = 0
  let taxableBase = 0
  let is = 0

  if (baseAfterCarry >= 0) {
    taxableBase = baseAfterCarry
    is = computeIS(taxableBase)
    newCarried = 0
  } else {
    taxableBase = 0
    is = 0
    newCarried = baseAfterCarry   // négatif, à reporter
  }

  return {
    fiscalResult,
    taxableBase,
    taxPaid: is,
    carryForward: {
      ...state,
      isDeficitCarried: newCarried,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Distribution des bénéfices SCI à l'IS
// ─────────────────────────────────────────────────────────────────────
/**
 * CGI art. 200 A — Imposition des dividendes.
 * Dernière mise à jour réglementaire : 2024.
 *
 * Une SCI à l'IS génère un résultat net après IS. Pour que l'associé
 * y accède, deux mécanismes :
 *  - Dividendes : PFU 30 % (12,8 % IR + 17,2 % PS) OU option barème IR
 *    (abattement 40 % + PS 17,2 % sur brut).
 *  - Remboursement Compte Courant d'Associé : fiscalement neutre,
 *    plafonné aux apports effectifs de l'associé.
 *
 * ⚠️ Estimation — consultez un expert-comptable.
 */

export interface DividendDistributionInput {
  /** Résultat net après IS disponible pour distribution. */
  netProfitAfterIS: number
  /** Montant à distribuer en dividendes (≤ netProfitAfterIS). */
  dividendAmount:   number
  /** Solde CCA disponible (apports de l'associé). */
  ccaAmount:        number
  /** TMI du foyer pour comparer PFU et barème. */
  tmiPct:           number
}

export interface DividendDistributionResult {
  netProfitAfterIS:    number
  dividendAmount:      number
  ccaReimbursement:    number   // = min(ccaAmount, netProfitAfterIS)

  // Option A — PFU (Flat Tax 30 %)
  pfuTax:              number
  netAfterPfu:         number

  // Option B — Barème IR (abattement 40 % + PS 17,2 % sur brut)
  baremeTax:           number
  netAfterBareme:      number

  optimalOption:       'pfu' | 'bareme'
  optimalOptionLabel:  string
  optimalNetAmount:    number

  /** Note de plafonnement si l'utilisateur demande plus de CCA que disponible. */
  ccaCapped:           boolean
  ccaAvailable:        number
}

/** Taux PFU : 30 % flat (12,8 IR + 17,2 PS). */
export const PFU_RATE = 0.30
/** Abattement dividende barème IR : 40 %. */
export const BAREME_DIVIDEND_ABATTEMENT = 0.40
/** Prélèvements sociaux 17,2 %. */
export const PS_RATE = 0.172

export function computeDividendDistribution(
  input: DividendDistributionInput,
): DividendDistributionResult {
  const dividend = Math.max(0, input.dividendAmount)

  // PFU : 30 % flat sur le brut
  const pfuTax      = dividend * PFU_RATE
  const netAfterPfu = dividend - pfuTax

  // Barème : IR sur (dividende × 60 %) au taux TMI + PS sur brut
  const irBareme       = dividend * (1 - BAREME_DIVIDEND_ABATTEMENT) * (input.tmiPct / 100)
  const psBareme       = dividend * PS_RATE
  const baremeTax      = irBareme + psBareme
  const netAfterBareme = dividend - baremeTax

  const optimalOption: 'pfu' | 'bareme' =
    netAfterPfu >= netAfterBareme ? 'pfu' : 'bareme'

  // Remboursement CCA : plafonné au solde de CCA et au profit distribuable.
  const ccaAvailable     = Math.max(0, input.ccaAmount)
  const ccaReimbursement = Math.min(ccaAvailable, Math.max(0, input.netProfitAfterIS))
  const ccaCapped        = ccaAvailable > input.netProfitAfterIS

  return {
    netProfitAfterIS:    input.netProfitAfterIS,
    dividendAmount:      dividend,
    ccaReimbursement,
    pfuTax,
    netAfterPfu,
    baremeTax,
    netAfterBareme,
    optimalOption,
    optimalOptionLabel: optimalOption === 'pfu'
      ? 'Flat Tax 30 % (PFU) — plus avantageux'
      : 'Barème IR — plus avantageux',
    optimalNetAmount: Math.max(netAfterPfu, netAfterBareme),
    ccaCapped,
    ccaAvailable,
  }
}
