// Toutes les formules financières de FYNIX.
// Aucune approximation — calculs exacts avec précision double.

// ─── Crédit ───────────────────────────────────────────────────────────────────

/**
 * Calcule la mensualité d'un crédit (hors assurance).
 * Formule : PMT = PV * r / (1 - (1 + r)^-n)
 * @param annualRate  Taux nominal annuel en % (ex: 3.5)
 * @param months      Durée en mois
 * @param principal   Capital emprunté
 */
export function pmt(annualRate: number, months: number, principal: number): number {
  const r = annualRate / 100 / 12
  if (r === 0) return principal / months
  return (principal * r) / (1 - Math.pow(1 + r, -months))
}

/**
 * Capital restant dû après k mensualités payées.
 * Formule : CRD = PV * (1+r)^k - PMT * ((1+r)^k - 1) / r
 */
export function capitalRemaining(
  annualRate: number,
  months: number,
  principal: number,
  paidPeriods: number,
): number {
  const r = annualRate / 100 / 12
  const monthly = pmt(annualRate, months, principal)
  if (r === 0) return principal - monthly * paidPeriods
  const factor = Math.pow(1 + r, paidPeriods)
  return principal * factor - monthly * ((factor - 1) / r)
}

// ─── Performance ──────────────────────────────────────────────────────────────

/**
 * CAGR — Taux de croissance annuel composé.
 * Formule : (Vf / Vi)^(1/n) - 1
 * @param initial  Valeur initiale
 * @param final    Valeur finale
 * @param years    Nombre d'années (peut être décimal)
 * @returns Taux en % (ex: 7.2 pour 7,2%)
 */
export function cagr(initial: number, final: number, years: number): number {
  if (initial <= 0 || years <= 0) return 0
  return (Math.pow(final / initial, 1 / years) - 1) * 100
}

/**
 * IRR (Taux de Rendement Interne) — Newton-Raphson sur flux de trésorerie.
 * @param cashFlows  Tableau de flux (négatif = sortie, positif = entrée)
 *                   Le premier flux est typiquement négatif (investissement initial)
 * @param guess      Estimation initiale (0.1 = 10%)
 * @returns Taux périodique en % ou null si non convergent
 */
export function irr(cashFlows: number[], guess = 0.1): number | null {
  const MAX_ITER = 1000
  const PRECISION = 1e-10
  let rate = guess

  for (let i = 0; i < MAX_ITER; i++) {
    let npv = 0
    let dnpv = 0

    for (let t = 0; t < cashFlows.length; t++) {
      const cf = cashFlows[t] ?? 0
      const factor = Math.pow(1 + rate, t)
      npv += cf / factor
      dnpv -= (t * cf) / (factor * (1 + rate))
    }

    if (Math.abs(dnpv) < PRECISION) return null

    const newRate = rate - npv / dnpv
    if (Math.abs(newRate - rate) < PRECISION) return newRate * 100

    rate = newRate
  }

  return null
}

// ─── Rendement immobilier ─────────────────────────────────────────────────────

/**
 * Rendement brut annuel.
 * @param annualRents     Loyers annuels bruts
 * @param acquisitionCost Prix d'acquisition total (prix + frais + travaux)
 */
export function grossYield(annualRents: number, acquisitionCost: number): number {
  if (acquisitionCost <= 0) return 0
  return (annualRents / acquisitionCost) * 100
}

/**
 * Rendement net (après charges, avant fiscalité).
 * @param annualRents    Loyers annuels
 * @param annualCharges  Total charges annuelles (taxe foncière, assurance, gestion, etc.)
 * @param acquisitionCost
 */
export function netYield(
  annualRents: number,
  annualCharges: number,
  acquisitionCost: number,
): number {
  if (acquisitionCost <= 0) return 0
  return ((annualRents - annualCharges) / acquisitionCost) * 100
}

/**
 * Rendement net-net (après charges ET fiscalité estimée).
 */
export function netNetYield(
  annualRents: number,
  annualCharges: number,
  annualTax: number,
  acquisitionCost: number,
): number {
  if (acquisitionCost <= 0) return 0
  return ((annualRents - annualCharges - annualTax) / acquisitionCost) * 100
}

// ─── Cash-flow ────────────────────────────────────────────────────────────────

/**
 * Cash-flow mensuel réel d'un bien immobilier.
 * @param monthlyRents    Loyers mensuels encaissés
 * @param monthlyCharges  Charges mensuelles (proratisées)
 * @param loanPayment     Mensualité crédit (capital + intérêts + assurance)
 */
export function propertyCashFlow(
  monthlyRents: number,
  monthlyCharges: number,
  loanPayment: number,
): number {
  return monthlyRents - monthlyCharges - loanPayment
}

// ─── Plus-value latente ───────────────────────────────────────────────────────

export function latentGain(currentValue: number, acquisitionCost: number): number {
  return currentValue - acquisitionCost
}

export function latentGainPercent(currentValue: number, acquisitionCost: number): number {
  if (acquisitionCost <= 0) return 0
  return ((currentValue - acquisitionCost) / acquisitionCost) * 100
}

// ─── Patrimoine ───────────────────────────────────────────────────────────────

export function netWorth(grossAssets: number, totalDebt: number): number {
  return grossAssets - totalDebt
}

// ─── Score de confiance ───────────────────────────────────────────────────────

/**
 * Calcule le % du patrimoine valorisé avec confidence = 'high'.
 * @param assets  Tableau de { value, confidence }
 */
export function confidenceScore(
  assets: Array<{ value: number; confidence: 'high' | 'medium' | 'low' }>,
): number {
  const total = assets.reduce((s, a) => s + a.value, 0)
  if (total === 0) return 0
  const highValue = assets
    .filter((a) => a.confidence === 'high')
    .reduce((s, a) => s + a.value, 0)
  return (highValue / total) * 100
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

/** Arrondit à 2 décimales (pour affichage financier). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Nombre d'années entre deux dates. */
export function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000)
}
