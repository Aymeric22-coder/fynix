/**
 * Suivi réel d'un bien — modèle "base + événements".
 *
 * Au lieu de demander à l'utilisateur de ressaisir ses loyers /
 * mensualités / charges chaque mois (modèle abandonné), on calcule
 * le suivi réel à partir de :
 *
 *  COUCHE 1 — Données de base (saisies une seule fois)
 *    - loyers : real_estate_lots × 12 (loyer brut annuel théorique)
 *    - charges : property_charges × 1 (annuel)
 *    - mensualités : debts → calculées automatiquement
 *
 *  COUCHE 2 — Événements ponctuels (property_events, migration 041)
 *    - impayés, vacances, charges exceptionnelles, travaux,
 *      sinistres, remboursements assurance, etc.
 *
 *    Le résultat = base proratisée à date + impacts des événements.
 *
 * Fonction pure — pas d'I/O.
 */

import type { PropertyEvent, PropertyEventKind } from '@/types/database.types'

export interface TrackingPeriod {
  /** 1er jour de la période (typiquement 1er janvier de l'année). */
  startDate: Date
  /** Dernier jour de la période — aujourd'hui ou 31 décembre. */
  endDate:   Date
}

export interface BaseAnnualData {
  expectedAnnualRent:        number
  expectedAnnualCharges:     number
  expectedAnnualLoanPayment: number
  /** Cash-flow théorique annuel (loyers − charges − crédit). */
  expectedAnnualCashFlow:    number
}

export interface EventImpact {
  eventId:    string
  kind:       PropertyEventKind
  label:      string
  date:       string                // ISO
  amount:     number                 // signé (négatif = perte)
  lotName?:   string
  isResolved: boolean
}

export type TrackingAlertKind =
  | 'unpaid_rent'
  | 'vacancy'
  | 'negative_cashflow'
  | 'high_exceptional_charges'
  | 'rent_below_market'

export interface TrackingAlert {
  severity: 'info' | 'warning' | 'critical'
  kind:     TrackingAlertKind
  message:  string
  amount?:  number
}

export interface TrackingResult {
  period:                  TrackingPeriod

  /** % de la période écoulée (0–100). */
  realizedRentPct:         number

  // Théorique proratisé à date
  expectedRentToDate:      number
  expectedChargesToDate:   number
  loanPaymentToDate:       number
  expectedCashFlowToDate:  number

  // Réel à date
  realizedRent:            number  // = attendu − impayés − vacances
  exceptionalCharges:      number  // somme charges_excep + travaux_impr
  totalPositiveEvents:     number  // remboursements assurance + autres positifs
  totalNegativeEvents:     number  // impayés + vacances + charges excep + travaux

  realCashFlowToDate:      number

  // Comparaison
  cashFlowDeltaVsExpected: number  // réel − théorique
  driftPct:                number  // delta / |théorique| × 100

  // Projection fin d'année (extrapolation)
  projectedAnnualRent:        number
  projectedAnnualCashFlow:    number
  projectedAnnualCashFlowPct: number   // (proj / théorique − 1) × 100

  // Détail des événements
  events:                  EventImpact[]
  alerts:                  TrackingAlert[]
}

// ─────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────

/** Différence en jours entre deux dates (UTC, bornes incluses). */
export function daysBetween(start: Date, end: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endUTC   = Date.UTC(end.getUTCFullYear(),   end.getUTCMonth(),   end.getUTCDate())
  return Math.max(0, Math.round((endUTC - startUTC) / MS_PER_DAY))
}

type LotLike = { id: string; name: string; rent_amount: number | null }

function num(v: number | null | undefined): number {
  return v ?? 0
}

// ─────────────────────────────────────────────────────────────────
//  Cœur du calcul
// ─────────────────────────────────────────────────────────────────

export function computeTracking(
  base:   BaseAnnualData,
  events: PropertyEvent[],
  lots:   LotLike[],
  period: TrackingPeriod,
): TrackingResult {
  // ── 1. Proratisation ───────────────────────────────────────────
  // Convention : on calcule par rapport à la durée TOTALE de l'année.
  // Si la période réelle dépasse l'année courante, on plafonne à 100 %.
  const yearLength = daysBetween(period.startDate, addDays(period.startDate, 365))
  const elapsed    = daysBetween(period.startDate, period.endDate)
  const ratio      = Math.min(1, elapsed / yearLength)

  const expectedRentToDate    = base.expectedAnnualRent        * ratio
  const expectedChargesToDate = base.expectedAnnualCharges     * ratio
  const loanPaymentToDate     = base.expectedAnnualLoanPayment * ratio
  const expectedCashFlowToDate = base.expectedAnnualCashFlow   * ratio

  // ── 2. Impacts des événements ──────────────────────────────────
  // Filtre : seuls les événements dans la fenêtre comptent.
  // Pour les vacances, on intersecte la période d'événement avec la période suivie.
  const inWindow = events.filter(e => {
    const d = new Date(e.event_date)
    return d >= period.startDate && d <= period.endDate
  })

  // 2.1 — Impayés non résolus → déduit du loyer attendu
  const unpaidRent = inWindow
    .filter(e => e.kind === 'rent_unpaid' && !e.is_resolved)
    .reduce((s, e) => s + Math.abs(num(e.amount_eur)), 0)

  // 2.2 — Vacances → perte = loyer journalier × jours d'intersection avec la période
  const dailyRent = yearLength > 0 ? base.expectedAnnualRent / yearLength : 0
  const vacancyLoss = events
    .filter(e => e.kind === 'vacancy')
    .reduce((s, e) => {
      if (!e.period_start) return s
      const ps = new Date(e.period_start)
      const pe = e.period_end ? new Date(e.period_end) : period.endDate
      // Intersection avec la fenêtre de suivi
      const start = ps > period.startDate ? ps : period.startDate
      const end   = pe < period.endDate   ? pe : period.endDate
      if (end < start) return s
      return s + dailyRent * daysBetween(start, end)
    }, 0)

  // 2.3 — Charges exceptionnelles + travaux imprévus (signe absolu)
  const exceptionalCharges = inWindow
    .filter(e => e.kind === 'exceptional_charge' || e.kind === 'unplanned_works')
    .reduce((s, e) => s + Math.abs(num(e.amount_eur)), 0)

  // 2.4 — Sinistres : la convention amount_eur est signée.
  //   - amount < 0 : coût sinistre → s'ajoute aux charges exceptionnelles
  //   - amount > 0 : remboursement → ajout positif au cash-flow
  let insuranceNegative = 0
  let insurancePositive = 0
  inWindow
    .filter(e => e.kind === 'insurance_claim')
    .forEach(e => {
      const amt = num(e.amount_eur)
      if (amt < 0) insuranceNegative += -amt
      else         insurancePositive +=  amt
    })

  // 2.5 — "Autre" : signé librement (positif/négatif accepté).
  let otherNegative = 0
  let otherPositive = 0
  inWindow
    .filter(e => e.kind === 'other')
    .forEach(e => {
      const amt = num(e.amount_eur)
      if (amt < 0) otherNegative += -amt
      else         otherPositive +=  amt
    })

  // ── 3. Loyers réalisés ─────────────────────────────────────────
  const realizedRent = Math.max(0, expectedRentToDate - unpaidRent - vacancyLoss)

  // ── 4. Cash-flow réel ──────────────────────────────────────────
  const totalNegativeEvents = unpaidRent + vacancyLoss + exceptionalCharges + insuranceNegative + otherNegative
  const totalPositiveEvents = insurancePositive + otherPositive

  const realCashFlowToDate =
    realizedRent
    - expectedChargesToDate
    - exceptionalCharges
    - insuranceNegative
    - otherNegative
    - loanPaymentToDate
    + totalPositiveEvents

  // ── 5. Drift ───────────────────────────────────────────────────
  const delta = realCashFlowToDate - expectedCashFlowToDate
  const driftPct = Math.abs(expectedCashFlowToDate) > 0.01
    ? (delta / Math.abs(expectedCashFlowToDate)) * 100
    : 0

  // ── 6. Projection fin d'année ──────────────────────────────────
  const remainingRatio = Math.max(0, 1 - ratio)
  const projectedAnnualRent = ratio > 0
    ? realizedRent / ratio
    : 0
  // Hypothèse : le reste de l'année tourne au théorique (pas de nouveaux événements)
  const projectedAnnualCashFlow = realCashFlowToDate
                                + (base.expectedAnnualCashFlow * remainingRatio)
  const projectedAnnualCashFlowPct = Math.abs(base.expectedAnnualCashFlow) > 0.01
    ? (projectedAnnualCashFlow / base.expectedAnnualCashFlow - 1) * 100
    : 0

  // ── 7. Alertes ─────────────────────────────────────────────────
  const alerts: TrackingAlert[] = []
  if (unpaidRent > 0) {
    alerts.push({
      severity: 'critical', kind: 'unpaid_rent', amount: unpaidRent,
      message: `${Math.round(unpaidRent).toLocaleString('fr-FR')} € de loyers impayés non résolus`,
    })
  }
  if (vacancyLoss > 200) {
    alerts.push({
      severity: 'warning', kind: 'vacancy', amount: vacancyLoss,
      message: `${Math.round(vacancyLoss).toLocaleString('fr-FR')} € de perte sur vacance locative`,
    })
  }
  if (realCashFlowToDate < 0 && expectedCashFlowToDate >= 0) {
    alerts.push({
      severity: 'critical', kind: 'negative_cashflow',
      message: 'Cash-flow négatif alors que le théorique est positif',
    })
  }
  if (driftPct < -15) {
    alerts.push({
      severity: 'warning', kind: 'negative_cashflow',
      message: `Écart de ${Math.abs(driftPct).toFixed(1)} % vs prévisionnel`,
    })
  }
  if (exceptionalCharges + insuranceNegative > base.expectedAnnualCharges * 0.5) {
    alerts.push({
      severity: 'warning', kind: 'high_exceptional_charges',
      amount: exceptionalCharges + insuranceNegative,
      message: `Charges exceptionnelles élevées : ${Math.round(exceptionalCharges + insuranceNegative).toLocaleString('fr-FR')} €`,
    })
  }

  // ── 8. Mapping des événements pour l'UI ────────────────────────
  const lotByName = new Map<string, string>(lots.map(l => [l.id, l.name]))
  const mappedEvents: EventImpact[] = inWindow.map(e => ({
    eventId:    e.id,
    kind:       e.kind,
    label:      e.label ?? '',
    date:       e.event_date,
    amount:     num(e.amount_eur),
    lotName:    e.lot_id ? lotByName.get(e.lot_id) : undefined,
    isResolved: e.is_resolved,
  }))

  return {
    period,
    realizedRentPct: ratio * 100,
    expectedRentToDate,
    expectedChargesToDate,
    loanPaymentToDate,
    expectedCashFlowToDate,
    realizedRent,
    exceptionalCharges:    exceptionalCharges + insuranceNegative,
    totalPositiveEvents,
    totalNegativeEvents,
    realCashFlowToDate,
    cashFlowDeltaVsExpected: delta,
    driftPct,
    projectedAnnualRent,
    projectedAnnualCashFlow,
    projectedAnnualCashFlowPct,
    events: mappedEvents,
    alerts,
  }
}

// ─────────────────────────────────────────────────────────────────
//  Helpers privés
// ─────────────────────────────────────────────────────────────────

function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime())
  r.setUTCDate(r.getUTCDate() + days)
  return r
}
