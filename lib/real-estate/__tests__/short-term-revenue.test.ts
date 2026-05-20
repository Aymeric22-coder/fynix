import { describe, it, expect } from 'vitest'
import {
  computeShortTermRevenue,
  buildShortTermParamsFromLot,
  type ShortTermRevenueParams,
} from '../short-term/revenue'

/** Base de parametres : tarif 80 EUR, occupation 70 %, 3 nuits/sejour, Airbnb 100 % a 15 %. */
function baseParams(overrides: Partial<ShortTermRevenueParams> = {}): ShortTermRevenueParams {
  return {
    nightlyRateLow:    80,
    occupancyRatePct:  70,
    avgStayNights:     3,
    platformAirbnbPct:    15,
    platformBookingPct:    0,
    platformOtherPct:      0,
    platformAirbnbMixPct: 100,
    platformBookingMixPct:  0,
    platformDirectMixPct:   0,
    cleaningFeePerStay:    0,
    cleaningCostPerStay:   0,
    linenCostPerStay:      0,
    conciergeFeePct:       0,
    ...overrides,
  }
}

describe('computeShortTermRevenue', () => {
  it('Test 1 — calcul de base sans saisonnalite', () => {
    const r = computeShortTermRevenue(baseParams())
    // 365 jours dispo, ~ 70 % d'occupation
    expect(r.totalDaysAvailable).toBe(365)
    // L'arrondi mois par mois peut donner 254-256, on tolere
    expect(r.totalOccupiedDays).toBeGreaterThanOrEqual(252)
    expect(r.totalOccupiedDays).toBeLessThanOrEqual(258)

    // CA brut ~ 80 EUR/nuit × occupiedDays
    const expectedGross = r.totalOccupiedDays * 80
    expect(r.grossRevenueTotal).toBeCloseTo(expectedGross, 0)

    // Commission Airbnb 15 % (100 % du mix passe par Airbnb)
    expect(r.platformCommissionTotal).toBeCloseTo(expectedGross * 0.15, 0)
    // Net = brut x 0,85
    expect(r.netRevenueTotal).toBeCloseTo(expectedGross * 0.85, 0)

    // Pas de charges ope => net proprio = net revenue
    expect(r.netOwnerRevenueTotal).toBeCloseTo(r.netRevenueTotal, 0)
  })

  it('Test 2 — saisonnalite : juillet a 95 %, tarif 120', () => {
    const r = computeShortTermRevenue(baseParams({
      seasonality: { 7: { occupancyRatePct: 95, nightlyRate: 120 } },
    }))
    const july = r.monthly[6]!
    expect(july.month).toBe(7)
    // 31 jours dispo, 95 % => 29 jours occupes (round)
    expect(july.occupiedDays).toBe(29)
    expect(july.grossRevenueNights).toBe(29 * 120)
  })

  it('Test 3 — frais menage refactures vs a charge', () => {
    const r = computeShortTermRevenue(baseParams({
      cleaningFeePerStay:  40,   // facture voyageur (revenu)
      cleaningCostPerStay: 60,   // a charge proprio (charge)
    }))
    // CA brut total = nuits + ménage facturé
    const totalCleaningRev = r.monthly.reduce((s, m) => s + m.grossRevenueCleaning, 0)
    const totalCleaningCost = r.monthly.reduce((s, m) => s + m.cleaningCost, 0)
    expect(totalCleaningRev).toBeCloseTo(r.totalNbStays * 40, 0)
    expect(totalCleaningCost).toBeCloseTo(r.totalNbStays * 60, 0)
    // Net ménage défavorable de 20 EUR/sejour
    expect(totalCleaningCost - totalCleaningRev).toBeCloseTo(r.totalNbStays * 20, 0)
  })

  it('Test 4 — conciergerie 15 % du CA net', () => {
    const r = computeShortTermRevenue(baseParams({ conciergeFeePct: 15 }))
    const totalConcierge = r.monthly.reduce((s, m) => s + m.conciergeFee, 0)
    expect(totalConcierge).toBeCloseTo(r.netRevenueTotal * 0.15, 0)
  })

  it('Test 5 — mix plateforme : Airbnb 60, Booking 30, direct 10', () => {
    const r = computeShortTermRevenue(baseParams({
      platformAirbnbPct: 15,
      platformBookingPct: 15,
      platformAirbnbMixPct:  60,
      platformBookingMixPct: 30,
      platformDirectMixPct:  10,
    }))
    // Commission effective = 0,6*15 + 0,3*15 + 0,1*0 = 13,5 %
    expect(r.platformCommissionTotal).toBeCloseTo(r.grossRevenueTotal * 0.135, 0)
  })

  it('Test 6 — jours bloques reduisent les jours disponibles', () => {
    const r = computeShortTermRevenue(baseParams({
      seasonality: { 8: { occupancyRatePct: 100, blockedDays: 10 } },
    }))
    const aug = r.monthly[7]!
    expect(aug.daysAvailable).toBe(21)  // 31 - 10
    expect(aug.occupiedDays).toBe(21)   // 100 % de 21
  })

  it('Test 7 — RevPAN = CA brut / jours dispo', () => {
    const r = computeShortTermRevenue(baseParams())
    expect(r.revenuePerAvailableNight).toBeCloseTo(r.grossRevenueTotal / r.totalDaysAvailable, 1)
  })

  it('Test 8 — occupation effective = jours occupes / jours dispo', () => {
    const r = computeShortTermRevenue(baseParams({
      seasonality: { 8: { occupancyRatePct: 100, blockedDays: 15 } },
    }))
    expect(r.annualOccupancyPct).toBeCloseTo(
      (r.totalOccupiedDays / r.totalDaysAvailable) * 100,
      1,
    )
  })

  it('tarification multi-saison : juillet utilise nightlyRateHigh', () => {
    const r = computeShortTermRevenue(baseParams({
      nightlyRateLow:  50,
      nightlyRateMid:  80,
      nightlyRateHigh: 120,
    }))
    const july = r.monthly[6]!
    // Juillet est en saison haute par défaut
    const avgRate = july.grossRevenueNights / july.occupiedDays
    expect(avgRate).toBe(120)
    // Janvier = saison basse
    const jan = r.monthly[0]!
    const avgRateJan = jan.grossRevenueNights / jan.occupiedDays
    expect(avgRateJan).toBe(50)
  })

  it('netOwnerRevenue = netRevenue - cleaningCost - linenCost - conciergeFee', () => {
    const r = computeShortTermRevenue(baseParams({
      cleaningCostPerStay: 30,
      linenCostPerStay:    10,
      conciergeFeePct:     20,
    }))
    const m = r.monthly[5]!  // juin
    expect(m.netOwnerRevenue).toBeCloseTo(
      m.netRevenue - m.cleaningCost - m.linenCost - m.conciergeFee,
      2,
    )
  })
})

describe('buildShortTermParamsFromLot', () => {
  it('renvoie null si rental_type != short_term', () => {
    expect(buildShortTermParamsFromLot({
      rental_type: 'long_term',
      nightly_rate_low: 80,
    })).toBeNull()
  })

  it('renvoie null si nightly_rate_low manquant', () => {
    expect(buildShortTermParamsFromLot({
      rental_type: 'short_term',
      nightly_rate_low: null,
    })).toBeNull()
  })

  it('construit un params valide avec defauts pour mixed', () => {
    const p = buildShortTermParamsFromLot({
      rental_type: 'mixed',
      nightly_rate_low: 60,
    })
    expect(p).not.toBeNull()
    expect(p!.nightlyRateLow).toBe(60)
    expect(p!.occupancyRatePct).toBe(70)         // defaut
    expect(p!.avgStayNights).toBe(3)             // defaut
    expect(p!.platformAirbnbMixPct).toBe(60)     // defaut
    expect(p!.platformBookingMixPct).toBe(30)    // defaut
    expect(p!.platformDirectMixPct).toBe(10)     // defaut
  })

  it('parse seasonality_coefficients depuis JSON', () => {
    const p = buildShortTermParamsFromLot({
      rental_type: 'short_term',
      nightly_rate_low: 50,
      seasonality_coefficients: {
        '7': { occupancyRatePct: 95, nightlyRate: 120 },
        '8': { occupancyRatePct: 90 },
      },
    })
    expect(p!.seasonality).toBeDefined()
    expect(p!.seasonality![7]?.occupancyRatePct).toBe(95)
    expect(p!.seasonality![7]?.nightlyRate).toBe(120)
    expect(p!.seasonality![8]?.occupancyRatePct).toBe(90)
  })
})
