/**
 * Validation des entrées de simulation.
 * Détecte les données partielles (typiquement crédit DB pas encore complété)
 * et rapporte les champs manquants pour l'UI.
 */

import type {
  LoanInput,
  RawLoanInput,
  RawSimulationInput,
  SimulationInput,
} from './types'

export interface ValidationOk {
  ok:    true
  input: SimulationInput
}

export interface ValidationIncomplete {
  ok:             false
  missingFields:  string[]
}

export type ValidationResult = ValidationOk | ValidationIncomplete

/**
 * Valide un RawSimulationInput. Si le crédit est partiellement renseigné
 * mais incomplet, on renvoie la liste des champs manquants.
 *
 * Règle : un crédit "intentionnel" est détecté si AU MOINS un champ
 * de prêt est renseigné. Dans ce cas tous les champs critiques doivent l'être.
 * Si AUCUN champ de prêt n'est renseigné OU si principal === 0,
 * on considère un achat cash (pas d'incomplétude).
 */
export function validateSimulationInput(raw: RawSimulationInput): ValidationResult {
  const missing: string[] = []

  // 1. Bien : champs minimaux
  if (raw.property.purchasePrice == null || raw.property.purchasePrice <= 0) {
    missing.push('property.purchasePrice')
  }

  // 2. Loyers : monthlyRent doit exister (peut être 0 explicite — autorisé)
  if (raw.rent.monthlyRent == null) {
    missing.push('rent.monthlyRent')
  }

  // 3. Crédit : si l'utilisateur a commencé à le renseigner, tous les champs critiques requis
  const loan = raw.loan
  const loanStarted = isLoanStarted(loan)

  if (loanStarted) {
    if (loan!.principal == null || loan!.principal < 0) {
      missing.push('loan.principal')
    }
    if (loan!.annualRatePct == null) {
      missing.push('loan.annualRatePct')
    }
    if (loan!.durationYears == null || loan!.durationYears <= 0) {
      missing.push('loan.durationYears')
    }
    // insuranceRatePct est tolérant (default 0)
    // startDate, bankFees, guaranteeFees ne sont pas critiques pour la projection
  }

  // 4. Régime : TMI requise pour les régimes IR-based
  const regime = raw.regime
  const needsTmi = regime.kind === 'sci_ir'
                || regime.kind === 'lmnp_reel'
                || regime.kind === 'lmnp_micro'
                || regime.kind === 'lmp'
                || regime.kind === 'foncier_nu'
                || regime.kind === 'foncier_micro'
  if (needsTmi && (regime as { tmiPct: number }).tmiPct == null) {
    missing.push('regime.tmiPct')
  }

  if (missing.length > 0) {
    return { ok: false, missingFields: missing }
  }

  // Construction du SimulationInput strictement typé
  const validatedLoan: LoanInput | undefined = loanStarted
    ? {
        principal:        loan!.principal!,
        annualRatePct:    loan!.annualRatePct!,
        durationYears:    loan!.durationYears!,
        insuranceRatePct: loan!.insuranceRatePct ?? 0,
        bankFees:         loan!.bankFees         ?? 0,
        guaranteeFees:    loan!.guaranteeFees    ?? 0,
        ...(loan!.startDate        !== undefined ? { startDate:        loan!.startDate        } : {}),
        ...(loan!.amortizationType !== undefined ? { amortizationType: loan!.amortizationType } : {}),
      }
    : undefined

  return {
    ok: true,
    input: {
      ...raw,
      loan: validatedLoan,
    } as SimulationInput,
  }
}

/**
 * Vrai si l'utilisateur a manifestement l'intention d'avoir un prêt
 * (au moins un champ non-cosmétique renseigné).
 */
function isLoanStarted(loan?: RawLoanInput): boolean {
  if (!loan) return false
  // Si principal est explicitement 0, c'est un cash purchase déclaré → pas de prêt
  if (loan.principal === 0) return false
  return loan.principal != null
      || loan.annualRatePct != null
      || loan.durationYears != null
      || loan.startDate != null
}
