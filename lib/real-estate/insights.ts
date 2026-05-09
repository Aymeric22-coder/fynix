/**
 * Insights et alertes drift (Phase 2).
 *
 * Détecte automatiquement les écarts significatifs entre le réel et la
 * projection : vacance excessive, charges qui dérapent, cash-flow inattendu,
 * appréciation/dépréciation forte. Pure fonction.
 *
 * Sortie : tableau d'alertes triées par sévérité, prêtes à être affichées
 * dans l'UI ou agrégées au niveau du dashboard.
 */

import type { ComparisonResult, YearComparison } from './compare'

// ─── Types ─────────────────────────────────────────────────────────────────

export type DriftSeverity = 'info' | 'warning' | 'critical'

export type DriftType =
  | 'rent_below_target'
  | 'rent_above_target'
  | 'charges_overrun'
  | 'charges_below_target'
  | 'cashflow_drift'
  | 'valuation_appreciation'
  | 'valuation_depreciation'
  | 'no_loan_payment'
  | 'partial_tracking'

export interface DriftAlert {
  type:        DriftType
  severity:    DriftSeverity
  title:       string
  message:     string
  /** Année concernée (la plus récente si multi-année). null = transverse. */
  year:        number | null
  /** Montant en € de l'impact (positif = gain, négatif = perte). */
  impactEUR:   number
  /** Action suggérée (texte court pour l'UI). null si rien à proposer. */
  action:      string | null
}

// ─── Seuils (configurables) ─────────────────────────────────────────────────

export interface InsightsThresholds {
  /** Seuil minimum de variance en % pour déclencher une alerte (en valeur absolue). */
  pctThreshold:           number
  /** Seuil minimum en € pour qu'une alerte soit considérée significative. */
  eurThreshold:           number
  /** Seuil critique (% en valeur absolue). */
  criticalPctThreshold:   number
  /** Seuil critique (€ en valeur absolue). */
  criticalEurThreshold:   number
}

const DEFAULT_THRESHOLDS: InsightsThresholds = {
  pctThreshold:         10,    // 10 % d'écart minimum
  eurThreshold:         500,   // 500 € d'écart minimum
  criticalPctThreshold: 25,    // 25 % d'écart = critique
  criticalEurThreshold: 3_000, // 3 000 € d'écart = critique
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function severityOf(
  pctAbs:    number,
  eurAbs:    number,
  thresholds: InsightsThresholds,
): DriftSeverity | null {
  // Logique AND : il faut que l'écart soit significatif EN VALEUR ET EN POURCENTAGE
  // pour générer une alerte. Évite le bruit (5 % de 100 € n'est pas matériel).
  const meetsBase     = eurAbs >= thresholds.eurThreshold         && pctAbs >= thresholds.pctThreshold
  const meetsCritical = eurAbs >= thresholds.criticalEurThreshold && pctAbs >= thresholds.criticalPctThreshold
  if (meetsCritical) return 'critical'
  if (meetsBase)     return 'warning'
  return null
}

function fmtPct(p: number): string {
  return `${p >= 0 ? '+' : ''}${p.toFixed(1)} %`
}

function fmtEUR(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1000) return `${v >= 0 ? '+' : '-'}${(abs / 1000).toFixed(1)} k€`
  return `${v >= 0 ? '+' : '-'}${abs.toFixed(0)} €`
}

// ─── Détection ──────────────────────────────────────────────────────────────

/**
 * Détecte les alertes drift à partir d'une comparaison réel vs simulation.
 * Si comparison.status === 'no_data', renvoie tableau vide.
 */
export function detectDriftAlerts(
  comparison: ComparisonResult,
  thresholds: InsightsThresholds = DEFAULT_THRESHOLDS,
): DriftAlert[] {
  if (comparison.status === 'no_data' || comparison.years.length === 0) return []

  const alerts: DriftAlert[] = []

  // Année la plus récente (priorité)
  const lastYear = comparison.years[comparison.years.length - 1]!

  // ── Loyers ────────────────────────────────────────────────────────────────
  alerts.push(...checkRentDrift(lastYear, thresholds))

  // ── Charges ───────────────────────────────────────────────────────────────
  alerts.push(...checkChargesDrift(lastYear, thresholds))

  // ── Cash-flow (cumul toutes années) ───────────────────────────────────────
  alerts.push(...checkCashflowDrift(comparison, thresholds))

  // ── Valorisation ──────────────────────────────────────────────────────────
  alerts.push(...checkValuationDrift(comparison, thresholds))

  // ── Mensualités manquantes ────────────────────────────────────────────────
  alerts.push(...checkLoanPayments(lastYear, thresholds))

  // ── Couverture partielle du suivi ─────────────────────────────────────────
  if (comparison.status === 'partial' && comparison.elapsedYears - comparison.trackedYears >= 1) {
    alerts.push({
      type:      'partial_tracking',
      severity:  'info',
      title:     'Suivi partiel',
      message:   `Sur ${comparison.elapsedYears} année(s) écoulée(s), seules ${comparison.trackedYears} ont des données réelles.`,
      year:      null,
      impactEUR: 0,
      action:    'Compléter les loyers et charges manquants',
    })
  }

  // Tri par sévérité (critical > warning > info), puis par |impactEUR| desc
  const sevOrder: Record<DriftSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => {
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity]
    if (sevDiff !== 0) return sevDiff
    return Math.abs(b.impactEUR) - Math.abs(a.impactEUR)
  })
}

// ─── Sous-détecteurs ───────────────────────────────────────────────────────

function checkRentDrift(year: YearComparison, t: InsightsThresholds): DriftAlert[] {
  const { rent } = year
  if (rent.simulated === 0) return []
  const pct = rent.variancePct ?? 0
  const sev = severityOf(Math.abs(pct), Math.abs(rent.variance), t)
  if (!sev) return []

  const isBelow = rent.variance < 0
  return [{
    type:      isBelow ? 'rent_below_target' : 'rent_above_target',
    severity:  isBelow ? sev : 'info',  // un loyer au-dessus est rarement critique
    title:     isBelow
                  ? `Loyers en-dessous du prévu (${year.year})`
                  : `Loyers au-dessus du prévu (${year.year})`,
    message:   isBelow
                  ? `Vous avez encaissé ${fmtPct(pct)} de loyers vs simulation. Vacance ou impayés probables.`
                  : `Vous encaissez ${fmtPct(pct)} de plus que prévu — bonne surprise.`,
    year:      year.year,
    impactEUR: rent.variance,
    action:    isBelow ? 'Vérifier la vacance et les loyers manquants' : null,
  }]
}

function checkChargesDrift(year: YearComparison, t: InsightsThresholds): DriftAlert[] {
  const { charges } = year
  if (charges.simulated === 0 && charges.actual === 0) return []
  // Pour les charges, on mesure le dépassement même si simulated = 0
  const pct = charges.variancePct ?? (charges.actual > 0 ? 100 : 0)
  const sev = severityOf(Math.abs(pct), Math.abs(charges.variance), t)
  if (!sev) return []

  const overrun = charges.variance > 0
  return [{
    type:      overrun ? 'charges_overrun' : 'charges_below_target',
    severity:  overrun ? sev : 'info',
    title:     overrun
                  ? `Charges supérieures au prévu (${year.year})`
                  : `Charges inférieures au prévu (${year.year})`,
    message:   overrun
                  ? `Vous avez payé ${fmtEUR(charges.variance)} de charges en plus (${fmtPct(pct)}).`
                  : `Vos charges sont ${fmtPct(pct)} en-dessous — économie de ${fmtEUR(-charges.variance)}.`,
    year:      year.year,
    impactEUR: -charges.variance,   // un dépassement charge = impact négatif
    action:    overrun ? 'Vérifier travaux exceptionnels ou hausse taxe foncière' : null,
  }]
}

function checkCashflowDrift(comparison: ComparisonResult, t: InsightsThresholds): DriftAlert[] {
  const total = comparison.totals.cashFlowVariance
  if (Math.abs(total) < t.eurThreshold) return []

  // Sévérité basée sur le cumul absolu
  const sev: DriftSeverity = Math.abs(total) >= t.criticalEurThreshold ? 'critical'
                            : Math.abs(total) >= t.eurThreshold        ? 'warning'
                            :                                            'info'

  const isNegative = total < 0
  return [{
    type:      'cashflow_drift',
    severity:  isNegative ? sev : 'info',
    title:     isNegative
                  ? 'Cash-flow cumulé sous le prévisionnel'
                  : 'Cash-flow cumulé au-dessus du prévisionnel',
    message:   `Cumul ${fmtEUR(total)} sur ${comparison.trackedYears} année(s) suivie(s).`,
    year:      null,
    impactEUR: total,
    action:    isNegative ? 'Réviser hypothèses simulation ou réduire charges' : null,
  }]
}

function checkValuationDrift(comparison: ComparisonResult, t: InsightsThresholds): DriftAlert[] {
  // On prend la dernière année avec une valuation réelle
  const lastWithVal = [...comparison.years].reverse().find((y) => y.valuation.actual !== null)
  if (!lastWithVal) return []
  const v = lastWithVal.valuation
  if (v.actual === null || v.simulated === 0) return []

  const pct = v.variancePct ?? 0
  const sev = severityOf(Math.abs(pct), Math.abs(v.variance ?? 0), t)
  if (!sev) return []

  const isAppreciating = (v.variance ?? 0) > 0
  return [{
    type:      isAppreciating ? 'valuation_appreciation' : 'valuation_depreciation',
    severity:  isAppreciating ? 'info' : sev,
    title:     isAppreciating
                  ? `Bien apprécié (+${fmtEUR(v.variance ?? 0)})`
                  : `Bien déprécié (${fmtEUR(v.variance ?? 0)})`,
    message:   `Estimation ${lastWithVal.year} ${fmtPct(pct)} vs projection (${fmtEUR(v.actual)} réel vs ${fmtEUR(v.simulated)} prévu).`,
    year:      lastWithVal.year,
    impactEUR: v.variance ?? 0,
    action:    null,
  }]
}

function checkLoanPayments(year: YearComparison, t: InsightsThresholds): DriftAlert[] {
  const { loan } = year
  // Si la simulation prévoit des mensualités mais aucune n'est saisie : alerte
  if (loan.simulated > 0 && loan.actual === 0) {
    return [{
      type:      'no_loan_payment',
      severity:  'warning',
      title:     `Aucune mensualité enregistrée (${year.year})`,
      message:   `${fmtEUR(loan.simulated)} de mensualités prévus, 0 € saisi. Le cash-flow réel est probablement surévalué.`,
      year:      year.year,
      impactEUR: -loan.simulated,
      action:    'Saisir les mensualités du crédit',
    }]
  }

  // Si écart significatif entre prévu et payé
  if (loan.simulated > 0 && Math.abs(loan.variance) >= t.eurThreshold) {
    const pct = loan.variancePct ?? 0
    const sev = severityOf(Math.abs(pct), Math.abs(loan.variance), t)
    if (sev) {
      const overpaid = loan.variance > 0
      return [{
        type:      'no_loan_payment',
        severity:  'info',
        title:     overpaid
                      ? `Mensualités supérieures au prévu (${year.year})`
                      : `Mensualités inférieures au prévu (${year.year})`,
        message:   `Écart ${fmtEUR(loan.variance)} (${fmtPct(pct)}). Différé, anticipation ou erreur de saisie ?`,
        year:      year.year,
        impactEUR: -loan.variance,
        action:    null,
      }]
    }
  }

  return []
}
