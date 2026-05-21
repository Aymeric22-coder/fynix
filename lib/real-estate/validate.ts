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

  // 3. Crédits — V3.1 supporte deux chemins :
  //    - `loans: RawLoanInput[]` (nouveau, multi-crédit) → on valide chacun
  //    - `loan: RawLoanInput` (legacy mono-crédit, @deprecated) → valide solo
  //    Si les deux sont fournis, `loans` (s'il est non vide) prime.
  //    Les crédits avec `principal === 0` ou totalement vides sont ignorés
  //    (sémantique "achat cash partiel" / placeholder UI).
  const rawLoans: RawLoanInput[] = (raw.loans && raw.loans.length > 0)
    ? raw.loans
    : (raw.loan ? [raw.loan] : [])

  const validatedLoans: LoanInput[] = []
  for (let i = 0; i < rawLoans.length; i++) {
    const l = rawLoans[i]!
    if (!isLoanStarted(l)) continue   // crédit vide ou principal=0 → ignoré
    const prefix = rawLoans.length > 1 ? `loans[${i}]` : 'loan'

    let hasError = false
    if (l.principal == null || l.principal < 0) {
      missing.push(`${prefix}.principal`); hasError = true
    }
    if (l.annualRatePct == null) {
      missing.push(`${prefix}.annualRatePct`); hasError = true
    }
    if (l.durationYears == null || l.durationYears <= 0) {
      missing.push(`${prefix}.durationYears`); hasError = true
    }
    if (hasError) continue

    validatedLoans.push({
      principal:        l.principal!,
      annualRatePct:    l.annualRatePct!,
      durationYears:    l.durationYears!,
      insuranceRatePct: l.insuranceRatePct ?? 0,
      bankFees:         l.bankFees         ?? 0,
      guaranteeFees:    l.guaranteeFees    ?? 0,
      ...(l.startDate           !== undefined ? { startDate:           l.startDate           } : {}),
      ...(l.amortizationType    !== undefined ? { amortizationType:    l.amortizationType    } : {}),
      ...(l.deferralType        !== undefined ? { deferralType:        l.deferralType        } : {}),
      ...(l.deferralMonths      !== undefined ? { deferralMonths:      l.deferralMonths      } : {}),
      ...(l.insuranceBase       !== undefined ? { insuranceBase:       l.insuranceBase       } : {}),
      ...(l.insuranceQuotitePct !== undefined ? { insuranceQuotitePct: l.insuranceQuotitePct } : {}),
    })
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

  // Construction du SimulationInput strictement typé.
  // Convention : on alimente `loans` quand il y a des crédits valides, et on
  // conserve `loan` = loans[0] pour la rétro-compat des consommateurs qui
  // lisent encore `input.loan` (kpis.ts, projection.ts retombent dessus si
  // `loans` est absent — mais on garde la cohérence des deux chemins).
  const { loans: _rawLoans, loan: _rawLoan, ...rest } = raw
  void _rawLoans; void _rawLoan
  const result: SimulationInput = {
    ...rest,
    ...(validatedLoans.length > 0 ? { loans: validatedLoans, loan: validatedLoans[0]! } : {}),
  } as SimulationInput

  return { ok: true, input: result }
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
