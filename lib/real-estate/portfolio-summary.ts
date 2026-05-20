/**
 * Agregation multi-biens du portefeuille immobilier.
 *
 * Pure function testable qui prend un tableau de `PropertySummary` (deja
 * enrichi des KPIs et compteurs par bien) et calcule les agregats consolides :
 *  - patrimoine net, plus-value latente, dette totale, LTV, DSCR
 *  - cash-flow net global mensuel + annuel
 *  - rendements brut et net-net moyens *ponderes* par le prix de revient
 *  - effort d'epargne mensuel (si CF global negatif)
 *  - alertes croisees (cash-flow, regime fiscal manquant, LTV eleve...)
 *
 * Le helper `buildPropertySummariesFromPortfolio` adapte le retour de
 * `computeRealEstatePortfolio` (DB + simulation) au format PropertySummary.
 */

import type { PropertySimResult } from './portfolio'
import type { FiscalRegimeKind } from './types'
import type { PropertyUsageType } from '@/types/database.types'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PropertySummary {
  id:                   string
  name:                 string
  city:                 string | null
  usageType:            PropertyUsageType
  fiscalRegime:         FiscalRegimeKind | null

  // Valeurs patrimoniales
  currentValue:         number
  totalCost:            number
  remainingCapital:     number
  netWorth:             number
  latentCapitalGain:    number

  // Flux mensuels
  monthlyRent:          number
  monthlyCharges:       number
  monthlyLoanPayment:   number
  monthlyNetCashFlow:   number

  // Rendements (en %, 5 pour 5 %)
  grossYieldPct:        number
  netNetYieldPct:       number

  // Statut
  hasAlerts:            boolean
  alertCount:           number
  isShortTerm:          boolean
  occupancyRatePct?:    number
}

export interface PortfolioAlert {
  severity:    'info' | 'warning' | 'critical'
  kind:
    | 'unpaid_rent'
    | 'under_rent'
    | 'negative_cashflow'
    | 'high_debt_ratio'
    | 'lmp_threshold'
    | 'fiscal_regime_missing'
    | 'vacancy'
    | 'credit_ending_soon'
  propertyId:   string
  propertyName: string
  message:      string
  amount?:      number
  actionLabel?: string
  actionUrl?:   string
}

export interface ChartDataPoint {
  label: string
  value: number
  /** Optionnel : couleur pour permettre une stable color par bien. */
  color?: string
}

export interface RealEstatePortfolioSummary {
  // Inventaire
  totalProperties: number
  byUsageType: {
    primaryResidence:   number
    secondaryResidence: number
    longTermRental:     number
    shortTermRental:    number
    mixedUse:           number
  }

  // Patrimoine
  totalCurrentValue:     number
  totalAcquisitionCost:  number
  totalRemainingCapital: number
  totalNetWorth:         number
  totalLatentGain:       number
  totalLatentGainPct:    number

  // Flux mensuels consolides
  totalMonthlyRent:     number
  totalMonthlyCharges:  number
  totalMonthlyLoan:     number
  totalMonthlyCashFlow: number
  totalAnnualCashFlow:  number

  // Rendements moyens ponderes par totalCost (sur biens locatifs seulement)
  weightedGrossYieldPct:  number
  weightedNetNetYieldPct: number

  // Effort d'epargne
  totalMonthlySavingsEffort: number

  // Repartition financement
  totalEquity:         number
  totalDebt:           number
  loanToValuePct:      number
  debtServiceRatioPct: number

  // Alertes cross-biens
  alerts: PortfolioAlert[]

  // Detail par bien
  properties: PropertySummary[]
}

// ─── Helpers internes ──────────────────────────────────────────────────────

function sum<T>(arr: T[], key: keyof T): number {
  return arr.reduce((s, x) => s + (Number(x[key]) || 0), 0)
}

const NON_RENTAL_USAGES: PropertyUsageType[] = ['primary_residence', 'secondary_residence']
function isRental(p: PropertySummary): boolean {
  return !NON_RENTAL_USAGES.includes(p.usageType)
}

// ─── Generation des alertes cross-biens ────────────────────────────────────

function generatePortfolioAlerts(
  properties: PropertySummary[],
  context: { ltvPct: number; dscrPct: number },
): PortfolioAlert[] {
  const alerts: PortfolioAlert[] = []

  // Regime fiscal manquant (biens locatifs uniquement)
  properties.filter(p => isRental(p) && !p.fiscalRegime).forEach(p => {
    alerts.push({
      severity:     'warning',
      kind:         'fiscal_regime_missing',
      propertyId:   p.id,
      propertyName: p.name,
      message:      'Régime fiscal non défini — rentabilité non calculée',
      actionLabel:  'Compléter',
      actionUrl:    `/immobilier/${p.id}/edit`,
    })
  })

  // Cash-flow negatif > 100 EUR/mois
  properties.filter(p => p.monthlyNetCashFlow < -100).forEach(p => {
    alerts.push({
      severity:     'warning',
      kind:         'negative_cashflow',
      propertyId:   p.id,
      propertyName: p.name,
      message:      `Effort d'épargne : ${Math.abs(p.monthlyNetCashFlow).toFixed(0)} €/mois`,
      amount:       p.monthlyNetCashFlow,
      actionUrl:    `/immobilier/${p.id}`,
    })
  })

  // LTV eleve (> 85 %) — alerte portefeuille
  if (context.ltvPct > 85) {
    alerts.push({
      severity:     'warning',
      kind:         'high_debt_ratio',
      propertyId:   'portfolio',
      propertyName: 'Portefeuille',
      message:      `LTV élevé : ${context.ltvPct.toFixed(1)} % — endettement > 85 % de la valeur`,
    })
  }

  // DSCR > 100 % — les mensualites depassent les loyers bruts
  if (context.dscrPct > 100) {
    alerts.push({
      severity:     'critical',
      kind:         'high_debt_ratio',
      propertyId:   'portfolio',
      propertyName: 'Portefeuille',
      message:      `DSCR à ${context.dscrPct.toFixed(0)} % — les mensualités dépassent les loyers bruts`,
    })
  }

  // Alertes derivees des insights existants
  properties.filter(p => p.hasAlerts && p.alertCount > 0).forEach(p => {
    alerts.push({
      severity:     'info',
      kind:         'under_rent',
      propertyId:   p.id,
      propertyName: p.name,
      message:      `${p.alertCount} alerte${p.alertCount > 1 ? 's' : ''} sur ce bien`,
      actionUrl:    `/immobilier/${p.id}`,
    })
  })

  // Tri par severite : critical -> warning -> info
  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })
}

// ─── Fonction principale ───────────────────────────────────────────────────

export function computePortfolioSummary(
  properties: PropertySummary[],
): RealEstatePortfolioSummary {
  const rentals = properties.filter(isRental)

  // Totaux patrimoniaux
  const totalCurrentValue     = sum(properties, 'currentValue')
  const totalAcquisitionCost  = sum(properties, 'totalCost')
  const totalRemainingCapital = sum(properties, 'remainingCapital')
  const totalNetWorth         = totalCurrentValue - totalRemainingCapital
  const totalLatentGain       = totalCurrentValue - totalAcquisitionCost

  // Flux mensuels :
  //  - loyers et charges : biens locatifs uniquement
  //  - mensualites loan : tous les biens (la RP genere une depense)
  //  - cash-flow net global : CF locatifs - mensualites RP/RS
  const totalMonthlyRent    = sum(rentals, 'monthlyRent')
  const totalMonthlyCharges = sum(rentals, 'monthlyCharges')
  const totalMonthlyLoan    = sum(properties, 'monthlyLoanPayment')
  const cfFromRentals       = sum(rentals, 'monthlyNetCashFlow')
  const cfNonRentalsCost    = sum(
    properties.filter(p => !isRental(p)),
    'monthlyLoanPayment',
  )
  const totalMonthlyCashFlow = cfFromRentals - cfNonRentalsCost

  // Rendements ponderes par totalCost (biens locatifs uniquement)
  const totalCostRentals = sum(rentals, 'totalCost')
  const weightedGrossYieldPct = totalCostRentals > 0
    ? rentals.reduce((s, p) => s + p.grossYieldPct * (p.totalCost / totalCostRentals), 0)
    : 0
  const weightedNetNetYieldPct = totalCostRentals > 0
    ? rentals.reduce((s, p) => s + p.netNetYieldPct * (p.totalCost / totalCostRentals), 0)
    : 0

  // LTV et DSCR
  const loanToValuePct = totalCurrentValue > 0
    ? (totalRemainingCapital / totalCurrentValue) * 100
    : 0
  const debtServiceRatioPct = totalMonthlyRent > 0
    ? (totalMonthlyLoan / totalMonthlyRent) * 100
    : 0

  // Apports cumules = valeur acquise - dette restante
  // (approximation : suppose pas de plus-value reversee en cash)
  const totalEquity = totalAcquisitionCost - totalRemainingCapital
                    + Math.max(0, totalLatentGain)

  const alerts = generatePortfolioAlerts(properties, {
    ltvPct: loanToValuePct,
    dscrPct: debtServiceRatioPct,
  })

  return {
    totalProperties: properties.length,
    byUsageType: {
      primaryResidence:   properties.filter(p => p.usageType === 'primary_residence').length,
      secondaryResidence: properties.filter(p => p.usageType === 'secondary_residence').length,
      longTermRental:     properties.filter(p => p.usageType === 'long_term_rental').length,
      shortTermRental:    properties.filter(p => p.usageType === 'short_term_rental').length,
      mixedUse:           properties.filter(p => p.usageType === 'mixed_use').length,
    },
    totalCurrentValue,
    totalAcquisitionCost,
    totalRemainingCapital,
    totalNetWorth,
    totalLatentGain,
    totalLatentGainPct: totalAcquisitionCost > 0
      ? (totalLatentGain / totalAcquisitionCost) * 100
      : 0,
    totalMonthlyRent,
    totalMonthlyCharges,
    totalMonthlyLoan,
    totalMonthlyCashFlow,
    totalAnnualCashFlow:       totalMonthlyCashFlow * 12,
    weightedGrossYieldPct,
    weightedNetNetYieldPct,
    totalMonthlySavingsEffort: Math.max(0, -totalMonthlyCashFlow),
    totalEquity,
    totalDebt:                 totalRemainingCapital,
    loanToValuePct,
    debtServiceRatioPct,
    alerts,
    properties,
  }
}

// ─── Adapter PortfolioResult -> PropertySummary[] ──────────────────────────

/**
 * Transforme le retour de `computeRealEstatePortfolio` en PropertySummary[]
 * en croisant avec les donnees brutes des biens.
 *
 * @param sims     Resultat de computeRealEstatePortfolio
 * @param rawProps Donnees brutes des biens (asset.current_value, usage_type, etc.)
 */
export function buildPropertySummaries(
  sims:     PropertySimResult[],
  rawProps: Array<{
    id:                string
    name:              string
    city:              string | null
    usageType:         PropertyUsageType
    fiscalRegime:      FiscalRegimeKind | null
    currentValue:      number | null
    totalCost:         number
    /** Loyer brut mensuel (somme des lots loues × loyer). */
    monthlyRent:       number
    monthlyCharges:    number
    isShortTerm:       boolean
    occupancyRatePct?: number
    alertCount:        number
  }>,
): PropertySummary[] {
  const simById = new Map(sims.map(s => [s.propertyId, s]))

  return rawProps.map(p => {
    const sim = simById.get(p.id)
    const kpis = sim?.simulation.kpis
    const incomplete = sim?.simulation.incompleteData ?? true

    const currentValue     = p.currentValue ?? 0
    const remainingCapital = sim?.capitalRemaining ?? 0
    const netWorth         = currentValue - remainingCapital
    const latentGain       = currentValue - p.totalCost

    return {
      id:                  p.id,
      name:                p.name,
      city:                p.city,
      usageType:           p.usageType,
      fiscalRegime:        p.fiscalRegime,
      currentValue,
      totalCost:           p.totalCost,
      remainingCapital,
      netWorth,
      latentCapitalGain:   latentGain,
      monthlyRent:         p.monthlyRent,
      monthlyCharges:      p.monthlyCharges,
      monthlyLoanPayment:  kpis?.monthlyPayment ?? 0,
      monthlyNetCashFlow:  incomplete ? 0 : (kpis?.monthlyCashFlowYear1 ?? 0),
      grossYieldPct:       incomplete ? 0 : (kpis?.grossYieldFAI ?? 0),
      netNetYieldPct:      incomplete ? 0 : (kpis?.netNetYield   ?? 0),
      hasAlerts:           p.alertCount > 0,
      alertCount:          p.alertCount,
      isShortTerm:         p.isShortTerm,
      ...(p.occupancyRatePct != null ? { occupancyRatePct: p.occupancyRatePct } : {}),
    }
  })
}
