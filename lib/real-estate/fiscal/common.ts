/**
 * Types et utilitaires partagés par les calculateurs fiscaux.
 */

/** Prélèvements sociaux (PS) en France — constante */
export const PRELEVEMENTS_SOCIAUX_PCT = 17.2

/**
 * Données comptables brutes d'une année (avant fiscalité) que l'on passe
 * au calculateur du régime concerné.
 */
export interface YearAccountingInputs {
  yearIndex:        number    // 1, 2, ...
  netRent:          number    // loyers nets de vacance
  // Charges déductibles
  pno:              number
  gli:              number
  propertyTax:      number
  cfe:              number
  accountant:       number
  condoFees:        number
  management:       number
  maintenance:      number
  other:            number
  // Crédit
  loanInterest:     number
  loanInsurance:    number
  // Amortissements (régimes "réels" uniquement, sinon 0)
  amortBuilding:    number
  amortWorks:       number
  amortFurniture:   number
  // Frais d'acquisition exceptionnels (année 1, "expense_y1" uniquement)
  exceptionalFees:  number
}

/**
 * État cumulé des déficits / amortissements reportés.
 * Chaque régime décide quelles cases utiliser.
 */
export interface CarryForwardState {
  /** Déficit reportable indéfiniment (SCI à l'IS) */
  isDeficitCarried:        number
  /** Déficit foncier reportable 10 ans (foncier_nu, sci_ir) — sur revenus fonciers uniquement */
  foncierDeficitsByAge:    number[]    // [age0, age1, ..., age9]
  /** Déficit BIC reportable 10 ans (LMNP réel) — sur BIC non-pro */
  bicDeficitsByAge:        number[]
  /**
   * Amortissement non utilisé cumulé (LMNP réel) — reportable indéfiniment.
   * En LMNP réel l'amortissement comptable ne peut pas créer ou augmenter un déficit :
   * la part au-delà du bénéfice avant amortissement est mise en stock ici,
   * et utilisée plus tard quand le bénéfice avant amortissement le permet.
   */
  unusedAmortStock:        number
}

export function makeInitialCarryForward(): CarryForwardState {
  return {
    isDeficitCarried:     0,
    foncierDeficitsByAge: [],
    bicDeficitsByAge:     [],
    unusedAmortStock:     0,
  }
}

/**
 * Vieillit d'un an la file FIFO de déficits, supprime ceux > 10 ans.
 * Retourne aussi le total expiré (perdu).
 */
export function ageDeficits(deficits: number[]): { aged: number[]; expired: number } {
  // Limite à 10 ans : on garde les 10 derniers slots, on shifte
  const next = [0, ...deficits]              // l'âge 0 nouveau, les autres vieillissent
  const expired = next.slice(10).reduce((s, v) => s + v, 0)  // tout ce qui dépasse 10 ans
  return { aged: next.slice(0, 10), expired }
}

/**
 * Consomme du stock de déficits (FIFO : on commence par les plus vieux).
 * Retourne la nouvelle file et le montant effectivement consommé.
 */
export function consumeDeficits(
  deficits: number[],
  amount: number,
): { consumed: number; remaining: number[] } {
  if (amount <= 0) return { consumed: 0, remaining: deficits.slice() }
  let toConsume = amount
  let consumed  = 0
  // FIFO : on attaque d'abord les plus vieux (fin du tableau)
  const arr = deficits.slice()
  for (let i = arr.length - 1; i >= 0 && toConsume > 0; i--) {
    const slot = arr[i] ?? 0
    const take = Math.min(slot, toConsume)
    arr[i]   = slot - take
    toConsume -= take
    consumed += take
  }
  return { consumed, remaining: arr }
}

/** Sortie standardisée d'un calculateur fiscal pour une année */
export interface YearTaxOutput {
  /** Résultat fiscal brut (avant imputation des reports) */
  fiscalResult:     number
  /** Base imposable effective (après imputation des reports) */
  taxableBase:      number
  /** Impôt total payé (IS / IR + PS / SSI selon régime) */
  taxPaid:          number
  /** État cumulé après cette année (à passer à l'année suivante) */
  carryForward:     CarryForwardState
}

export type FiscalCalculator = (
  inputs: YearAccountingInputs,
  state:  CarryForwardState,
) => YearTaxOutput
