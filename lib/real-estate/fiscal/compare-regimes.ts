/**
 * Comparateur de régimes fiscaux pour un même bien.
 *
 * Exécute `runSimulation` avec chacun des 7 régimes français supportés,
 * extrait les chiffres clés de l'année 1 et identifie le régime le plus
 * avantageux (cash-flow net après impôts le plus élevé).
 *
 * Pure fonction : pas d'I/O, pas de hook React.
 */

import { runSimulation } from '../index'
import { FISCAL_REGIME_LABELS, type FiscalRegimeKind, type SimulationInput } from '../types'

export interface RegimeComparisonRow {
  regime:              FiscalRegimeKind
  label:               string
  annualGrossRent:     number
  annualCharges:       number       // hors crédit
  annualLoanPayment:   number
  annualTax:           number       // peut être négatif (crédit d'impôt foncier réel)
  annualNetCashFlow:   number
  monthlyNetCashFlow:  number
  /** Rentabilité nette = CF après impôt / coût total opération × 100 */
  netYieldPct:         number
  recommended:         boolean
  notApplicable:       boolean
  notApplicableReason?: string
}

export interface RegimeComparisonResult {
  rows:        RegimeComparisonRow[]
  bestRegime:  FiscalRegimeKind | null
  bestLabel:   string | null
  horizon:     number
}

/**
 * Liste exhaustive des régimes à tester. L'ordre détermine l'affichage.
 */
const ALL_REGIMES: FiscalRegimeKind[] = [
  'foncier_micro',
  'foncier_nu',
  'lmnp_micro',
  'lmnp_reel',
  'lmp',
  'sci_ir',
  'sci_is',
]

/**
 * Paramètres "réels" par défaut (amortissements / land share). Repris
 * de la migration 005 pour rester aligné avec le formulaire de création.
 */
const DEFAULT_REAL_PARAMS = {
  landSharePct:             15,
  amortBuildingYears:       30,
  amortWorksYears:          15,
  amortFurnitureYears:      7,
  acquisitionFeesTreatment: 'expense_y1' as const,
}

/**
 * Construit la simulation à exécuter pour un régime donné, à partir des
 * paramètres communs du bien.
 */
function buildInputForRegime(
  base:   Omit<SimulationInput, 'regime'>,
  kind:   FiscalRegimeKind,
  tmiPct: number,
  ssiRatePct: number,
  lmnpMicroAbattementPct: number,
): SimulationInput {
  switch (kind) {
    case 'sci_is':
      return { ...base, regime: { kind, ...DEFAULT_REAL_PARAMS } }
    case 'sci_ir':
      return { ...base, regime: { kind, tmiPct } }
    case 'lmnp_reel':
      return { ...base, regime: { kind, tmiPct, ...DEFAULT_REAL_PARAMS } }
    case 'lmnp_micro':
      return { ...base, regime: { kind, tmiPct, abattementPct: lmnpMicroAbattementPct } }
    case 'lmp':
      return { ...base, regime: { kind, tmiPct, ssiRatePct, ...DEFAULT_REAL_PARAMS } }
    case 'foncier_nu':
      return { ...base, regime: { kind, tmiPct } }
    case 'foncier_micro':
      return { ...base, regime: { kind, tmiPct } }
  }
}

export interface CompareRegimesOptions {
  /** TMI utilisateur en %, défaut 30 */
  tmiPct?:                  number
  /** Taux SSI LMP, défaut 35 % */
  ssiRatePct?:              number
  /** Abattement LMNP micro-BIC, défaut 50 % (meublé classique) */
  lmnpMicroAbattementPct?:  number
  /** Horizon en années (informatif — l'année 1 est utilisée pour ranking) */
  horizonYears?:            number
  /**
   * Si fourni, restreint les régimes testés. Utile pour exclure les régimes
   * incompatibles avec le mode de détention (ex : un bien détenu en SCI à
   * l'IS ne peut pas être comparé à un régime LMNP).
   */
  applicableRegimes?:       FiscalRegimeKind[]
}

/**
 * Compare jusqu'à 7 régimes fiscaux pour un même bien.
 *
 * `base` doit contenir tous les paramètres du bien EXCEPTÉ `regime` :
 * property, loan, rent, charges, downPayment, horizonYears.
 */
export function compareRegimes(
  base:    Omit<SimulationInput, 'regime'>,
  options: CompareRegimesOptions = {},
): RegimeComparisonResult {
  const tmiPct                = options.tmiPct                ?? 30
  const ssiRatePct            = options.ssiRatePct            ?? 35
  const lmnpMicroAbattementPct = options.lmnpMicroAbattementPct ?? 50
  const horizon               = options.horizonYears ?? base.horizonYears ?? 10
  const applicable            = options.applicableRegimes ?? ALL_REGIMES

  const totalCost =
    base.property.purchasePrice +
    base.property.notaryFees +
    base.property.worksAmount +
    (base.loan?.bankFees ?? 0) +
    (base.loan?.guaranteeFees ?? 0)

  const rows: RegimeComparisonRow[] = ALL_REGIMES.map(kind => {
    const isApplicable = applicable.includes(kind)
    if (!isApplicable) {
      return {
        regime:              kind,
        label:               FISCAL_REGIME_LABELS[kind],
        annualGrossRent:     0,
        annualCharges:       0,
        annualLoanPayment:   0,
        annualTax:           0,
        annualNetCashFlow:   0,
        monthlyNetCashFlow:  0,
        netYieldPct:         0,
        recommended:         false,
        notApplicable:       true,
        notApplicableReason: 'Régime incompatible avec le mode de détention du bien',
      }
    }

    const input  = buildInputForRegime(base, kind, tmiPct, ssiRatePct, lmnpMicroAbattementPct)
    const result = runSimulation(input)
    const y1     = result.projection[0]

    if (!y1) {
      return {
        regime:              kind,
        label:               FISCAL_REGIME_LABELS[kind],
        annualGrossRent:     0,
        annualCharges:       0,
        annualLoanPayment:   0,
        annualTax:           0,
        annualNetCashFlow:   0,
        monthlyNetCashFlow:  0,
        netYieldPct:         0,
        recommended:         false,
        notApplicable:       true,
        notApplicableReason: 'Données insuffisantes',
      }
    }

    const netYieldPct = totalCost > 0
      ? (y1.cashFlowAfterTax / totalCost) * 100
      : 0

    return {
      regime:              kind,
      label:               FISCAL_REGIME_LABELS[kind],
      annualGrossRent:     y1.grossRent,
      annualCharges:       y1.charges,
      annualLoanPayment:   y1.loanPayment,
      annualTax:           y1.taxPaid,
      annualNetCashFlow:   y1.cashFlowAfterTax,
      monthlyNetCashFlow:  y1.cashFlowAfterTax / 12,
      netYieldPct,
      recommended:         false,
      notApplicable:       false,
    }
  })

  // Sélection du régime applicable au meilleur cash-flow
  const applicableRows = rows.filter(r => !r.notApplicable)
  if (applicableRows.length > 0) {
    const best = applicableRows.reduce((a, b) =>
      b.annualNetCashFlow > a.annualNetCashFlow ? b : a,
    )
    best.recommended = true
    return {
      rows,
      bestRegime: best.regime,
      bestLabel:  best.label,
      horizon,
    }
  }

  return { rows, bestRegime: null, bestLabel: null, horizon }
}
