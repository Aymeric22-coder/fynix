/**
 * KPIs agreges pour la location courte duree au niveau du bien
 * (somme sur tous les lots short_term / mixed).
 *
 * Fournit les indicateurs hoteliers standards qui n'existent pas
 * en longue duree :
 *  - CA brut annuel (loyers + frais menage refactures)
 *  - Net proprietaire annuel
 *  - Taux d'occupation moyen pondere
 *  - RevPAN (Revenue Per Available Night)
 *  - Tarif moyen pondere
 *  - Nombre de sejours
 */

import type { DbLot } from '../build-from-db'
import {
  buildShortTermParamsFromLot,
  computeShortTermRevenue,
  type AnnualShortTermRevenue,
} from './revenue'

export interface ShortTermPropertyKpis {
  /** Au moins un lot du bien est en courte duree (short_term ou mixed). */
  hasShortTermLots:        boolean
  nbShortTermLots:         number

  // Agregats annuels
  grossRevenueTotal:       number
  netOwnerRevenueTotal:    number
  platformCommissionTotal: number
  operationalCostsTotal:   number

  // KPIs hoteliers ponderes
  totalDaysAvailable:      number
  totalOccupiedDays:       number
  avgOccupancyPct:         number
  totalNbStays:            number
  revenuePerAvailableNight: number
  avgNightlyRate:          number

  /** Decomposition par lot pour permettre l'affichage detaille. */
  perLot: Array<{ lotIndex: number; revenue: AnnualShortTermRevenue }>
}

export function computeShortTermKpisForProperty(lots: DbLot[]): ShortTermPropertyKpis {
  const perLot: Array<{ lotIndex: number; revenue: AnnualShortTermRevenue }> = []

  lots.forEach((lot, idx) => {
    const params = buildShortTermParamsFromLot(lot)
    if (!params) return
    perLot.push({ lotIndex: idx, revenue: computeShortTermRevenue(params) })
  })

  if (perLot.length === 0) {
    return {
      hasShortTermLots:        false,
      nbShortTermLots:         0,
      grossRevenueTotal:       0,
      netOwnerRevenueTotal:    0,
      platformCommissionTotal: 0,
      operationalCostsTotal:   0,
      totalDaysAvailable:      0,
      totalOccupiedDays:       0,
      avgOccupancyPct:         0,
      totalNbStays:            0,
      revenuePerAvailableNight: 0,
      avgNightlyRate:          0,
      perLot,
    }
  }

  const sum = (key: keyof AnnualShortTermRevenue): number =>
    perLot.reduce((s, l) => s + (l.revenue[key] as number), 0)

  const totalDaysAvailable = sum('totalDaysAvailable')
  const totalOccupiedDays  = sum('totalOccupiedDays')
  const grossRevenueTotal  = sum('grossRevenueTotal')

  // Tarif moyen ponderé = SUM(avgRate × occupiedDays) / SUM(occupiedDays)
  const sumNightlyRevenue = perLot.reduce(
    (s, l) => s + l.revenue.avgNightlyRate * l.revenue.totalOccupiedDays,
    0,
  )

  return {
    hasShortTermLots:        true,
    nbShortTermLots:         perLot.length,
    grossRevenueTotal,
    netOwnerRevenueTotal:    sum('netOwnerRevenueTotal'),
    platformCommissionTotal: sum('platformCommissionTotal'),
    operationalCostsTotal:   sum('operationalCostsTotal'),
    totalDaysAvailable,
    totalOccupiedDays,
    avgOccupancyPct: totalDaysAvailable > 0
      ? (totalOccupiedDays / totalDaysAvailable) * 100
      : 0,
    totalNbStays:    sum('totalNbStays'),
    revenuePerAvailableNight: totalDaysAvailable > 0
      ? grossRevenueTotal / totalDaysAvailable
      : 0,
    avgNightlyRate: totalOccupiedDays > 0
      ? sumNightlyRevenue / totalOccupiedDays
      : 0,
    perLot,
  }
}
