/**
 * Calcul d'amortissement de prêt à échéances constantes (Phase 3).
 *
 * Pure et déterministe — aucun accès DB, aucune persistance.
 *
 * Couvre :
 *  - Échéances constantes classiques (PMT)
 *  - Différé partiel : intérêts seuls payés pendant la phase de différé,
 *    capital intact, l’amortissement classique commence après.
 *  - Différé total : aucun paiement (sauf assurance), les intérêts
 *    s’accumulent sur le capital — capital restant dû croissant pendant
 *    la phase de différé.
 *  - Assurance sur capital initial (mensualité fixe) ou sur CRD (dégressive).
 *  - Quotité d’assurance (ex : 100 % pour mono-emprunteur, 200 % couple
 *    100 %/100 %).
 *  - Frais bancaires et de garantie intégrés au coût total.
 *  - TAEG approximatif via IRR sur les flux mensuels.
 *
 * Migration 006 — Cette lib remplace `lib/finance/amortization.ts`
 * (anciennement utilisé par la section Dette indépendante).
 */

import type {
  AmortizationMonth,
  AmortizationSchedule,
  AmortizationYear,
  LoanInput,
} from './types'

// ─── PMT ───────────────────────────────────────────────────────────────────

/**
 * Mensualité d'un prêt à échéances constantes (formule PMT).
 * @param principal       Capital emprunté
 * @param annualRatePct   Taux annuel en pourcentage (ex 3.76)
 * @param durationYears   Durée en années
 */
export function computeMonthlyPayment(
  principal: number,
  annualRatePct: number,
  durationYears: number,
): number {
  if (principal <= 0 || durationYears <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = durationYears * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

// ─── Schedule ──────────────────────────────────────────────────────────────

/**
 * Construit le tableau d'amortissement complet (mensuel + agrégat annuel).
 * Si principal == 0 ou durationYears == 0 → renvoie un schedule "vide".
 *
 * Gestion du différé :
 *  - 'none'    : amortissement classique sur toute la durée.
 *  - 'partial' : pendant `deferralMonths`, on paie SEULEMENT les intérêts
 *                (capital inchangé). À partir du mois suivant, PMT calculé
 *                sur le capital initial réparti sur la durée restante.
 *  - 'total'   : pendant `deferralMonths`, AUCUN paiement (sauf assurance
 *                qui continue) — les intérêts capitalisent. À partir du
 *                mois suivant, PMT calculé sur le capital gonflé réparti
 *                sur la durée restante.
 */
export function buildAmortizationSchedule(loan: LoanInput): AmortizationSchedule {
  const principal       = Math.max(0, loan.principal)
  const annualRate      = loan.annualRatePct
  const durationYears   = loan.durationYears
  const insuranceRate   = loan.insuranceRatePct ?? 0
  const insuranceBase   = loan.insuranceBase ?? 'capital_initial'
  const quotite         = (loan.insuranceQuotitePct ?? 100) / 100
  const deferralType    = loan.deferralType ?? 'none'
  const deferralMonths  = Math.max(0, Math.min(loan.deferralMonths ?? 0, durationYears * 12 - 1))
  const bankFees        = loan.bankFees ?? 0
  const guaranteeFees   = loan.guaranteeFees ?? 0

  const months: AmortizationMonth[] = []
  const years: AmortizationYear[]   = []

  // Schedule vide
  if (principal === 0 || durationYears === 0) {
    return {
      monthlyPayment:   0,
      monthlyInsurance: 0,
      totalMonthly:     0,
      totalInterest:    0,
      totalInsurance:   0,
      totalFees:        bankFees + guaranteeFees,
      totalCost:        bankFees + guaranteeFees,
      aprPct:           0,
      months,
      years,
    }
  }

  const r       = annualRate / 100 / 12
  const insR    = (insuranceRate / 100 / 12) * quotite
  const totalN  = Math.round(durationYears * 12)
  const amortN  = totalN - deferralMonths   // mois d'amortissement effectif (après différé)

  // Capital de départ pour la phase amortissable (peut être > principal si différé total)
  let balance = principal
  if (deferralType === 'total' && deferralMonths > 0) {
    // En différé total, les intérêts capitalisent : capital fin différé = principal × (1+r)^deferralMonths
    balance = principal * Math.pow(1 + r, deferralMonths)
  }

  // Mensualité de la phase amortissable, calculée sur le capital fin de différé et la durée restante
  const monthlyPayment = computeMonthlyPayment(balance, annualRate, amortN / 12)

  // Reset balance pour le replay mois par mois
  balance = principal

  let totalInterest  = 0
  let totalInsurance = 0

  // Loop mensuel
  let currentYear = 1
  let yI = 0, yP = 0, yIns = 0, yPay = 0
  let monthsInYear = 0

  for (let m = 1; m <= totalN; m++) {
    const isInDeferral = m <= deferralMonths
    const interestMonth = balance * r

    // Calcul de l'assurance (selon base)
    const insBase = insuranceBase === 'capital_remaining' ? balance : principal
    const insMonth = insBase * insR

    let principalPart = 0
    let payment = 0

    if (isInDeferral && deferralType === 'total') {
      // Différé total : aucun paiement (sauf assurance), les intérêts capitalisent
      balance += interestMonth
      // payment = 0 (mais l'utilisateur paie quand même l'assurance)
    } else if (isInDeferral && deferralType === 'partial') {
      // Différé partiel : on paie SEULEMENT les intérêts
      payment = interestMonth
    } else {
      // Phase amortissable normale
      payment = monthlyPayment
      principalPart = monthlyPayment - interestMonth
      // Garde-fou : si arrondis font dépasser, clamp au CRD
      if (principalPart > balance) principalPart = balance
      balance = Math.max(0, balance - principalPart)
    }

    months.push({
      monthIndex:       m,
      payment,
      interest:         isInDeferral && deferralType === 'total' ? 0 : interestMonth,
      // En différé total, les intérêts capitalisés ne sont PAS comptés comme "payés"
      // (ils sont payés plus tard via la mensualité gonflée). On les sort de totalInterest
      // pour cohérence comptable.
      principal:        principalPart,
      insurance:        insMonth,
      remainingCapital: balance,
      isDeferred:       isInDeferral,
    })

    // Compteurs : on ne compte pas les intérêts capitalisés comme "payés" en différé total
    if (!(isInDeferral && deferralType === 'total')) {
      totalInterest += interestMonth
    }
    totalInsurance += insMonth

    yI   += isInDeferral && deferralType === 'total' ? 0 : interestMonth
    yP   += principalPart
    yIns += insMonth
    yPay += payment
    monthsInYear++

    // Agrégat annuel
    if (monthsInYear === 12 || m === totalN) {
      years.push({
        year:             currentYear,
        totalPayment:     yPay,
        interest:         yI,
        principal:        yP,
        insurance:        yIns,
        remainingCapital: balance,
      })
      currentYear++
      yI = 0; yP = 0; yIns = 0; yPay = 0
      monthsInYear = 0
    }
  }

  // Assurance moyenne (utile pour l'affichage de la mensualité totale)
  const monthlyInsurance = totalInsurance / totalN
  const totalFees        = bankFees + guaranteeFees
  const totalCost        = totalInterest + totalInsurance + totalFees

  // TAEG approximatif via IRR sur les flux mensuels
  const aprPct = computeApproxAPR(loan, months)

  return {
    monthlyPayment,
    monthlyInsurance,
    totalMonthly:     monthlyPayment + monthlyInsurance,
    totalInterest,
    totalInsurance,
    totalFees,
    totalCost,
    aprPct,
    months,
    years,
  }
}

// ─── CRD à date ────────────────────────────────────────────────────────────

/**
 * Capital restant dû à une date donnée, à partir de la date de début du prêt.
 * - Si pas de date de début ou date avant le début → renvoie le principal initial.
 * - Si date après la fin du prêt → renvoie 0.
 * - Sinon, renvoie le CRD du mois écoulé correspondant.
 */
export function computeRemainingCapitalAt(
  loan: LoanInput,
  simulationDate: Date = new Date(),
): number {
  if (!loan.principal || loan.principal <= 0) return 0
  if (!loan.startDate) return loan.principal

  const start = loan.startDate
  if (simulationDate <= start) return loan.principal

  // Nombre de mois écoulés (entiers) depuis le début du prêt
  const monthsElapsed =
    (simulationDate.getFullYear() - start.getFullYear()) * 12 +
    (simulationDate.getMonth() - start.getMonth())
  if (monthsElapsed <= 0) return loan.principal

  const schedule = buildAmortizationSchedule(loan)
  if (monthsElapsed >= schedule.months.length) return 0

  const m = schedule.months[monthsElapsed - 1]
  return m ? m.remainingCapital : 0
}

// ─── Coût total ────────────────────────────────────────────────────────────

/**
 * Coût total du crédit = intérêts + assurance + frais (hors capital remboursé).
 * Égal à `schedule.totalCost`, fourni en helper pour clarté d'API.
 */
export function computeTotalLoanCost(loan: LoanInput): number {
  const schedule = buildAmortizationSchedule(loan)
  return schedule.totalCost
}

// ─── TAEG approximatif ─────────────────────────────────────────────────────

/**
 * TAEG (Taux Annuel Effectif Global) approximatif via IRR.
 *
 * Flux du point de vue de l'emprunteur :
 *  - t=0 : reçoit `principal`, paie `bankFees + guaranteeFees` immédiatement
 *          (donc encaisse net = principal - frais initiaux).
 *  - t=1..N : verse chaque mois `payment + insurance` (sortie de cash).
 *
 * On résout `IRR` mensuel par bisection (méthode robuste, ne diverge pas
 * comme Newton-Raphson sur les cas pathologiques), puis on convertit en
 * taux annuel effectif via (1 + r)^12 - 1.
 */
export function computeApproxAPR(
  loan:   LoanInput,
  months: AmortizationMonth[] = buildAmortizationSchedule(loan).months,
): number {
  const principal = Math.max(0, loan.principal)
  if (principal === 0 || months.length === 0) return 0

  const fees = (loan.bankFees ?? 0) + (loan.guaranteeFees ?? 0)
  const netReceived = principal - fees
  if (netReceived <= 0) return 0

  // Cashflows depuis l'emprunteur :
  // index 0 : + netReceived (entrée à t=0)
  // index 1..N : - (payment + insurance) à chaque mois
  const flows: number[] = [netReceived]
  for (const m of months) {
    flows.push(-(m.payment + m.insurance))
  }

  // NPV en fonction du taux mensuel r
  const npv = (r: number): number => {
    let s = 0
    for (let t = 0; t < flows.length; t++) {
      s += (flows[t] ?? 0) / Math.pow(1 + r, t)
    }
    return s
  }

  // Bisection sur [0, 1] (taux mensuel)
  let lo = 0
  let hi = 1
  let npvLo = npv(lo)
  let npvHi = npv(hi)
  // Si pas de changement de signe, fallback : taux nominal
  if (npvLo * npvHi > 0) {
    return loan.annualRatePct
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const npvMid = npv(mid)
    if (Math.abs(npvMid) < 1e-7) {
      // Conversion mensuel → annuel effectif
      return (Math.pow(1 + mid, 12) - 1) * 100
    }
    if (npvMid * npvLo < 0) {
      hi = mid
      npvHi = npvMid
    } else {
      lo = mid
      npvLo = npvMid
    }
  }

  const r = (lo + hi) / 2
  return (Math.pow(1 + r, 12) - 1) * 100
}
