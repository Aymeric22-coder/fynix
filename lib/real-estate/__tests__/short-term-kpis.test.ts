import { describe, it, expect } from 'vitest'
import { computeShortTermKpisForProperty } from '../short-term/kpis'
import type { DbLot } from '../build-from-db'
import { computeMonthlyRentForLot } from '../build-from-db'

describe('computeShortTermKpisForProperty', () => {
  it('renvoie hasShortTermLots=false quand aucun lot courte duree', () => {
    const lots: DbLot[] = [
      { rent_amount: 800 },
      { rent_amount: 600, rental_type: 'long_term' },
    ]
    const k = computeShortTermKpisForProperty(lots)
    expect(k.hasShortTermLots).toBe(false)
    expect(k.nbShortTermLots).toBe(0)
    expect(k.grossRevenueTotal).toBe(0)
  })

  it('agrege correctement deux lots courte duree', () => {
    const lots: DbLot[] = [
      {
        rent_amount: null,
        rental_type: 'short_term',
        nightly_rate_low: 80,
        occupancy_rate_pct: 70,
        avg_stay_nights: 3,
        platform_airbnb_pct: 15,
        platform_airbnb_mix_pct: 100,
        platform_booking_mix_pct: 0,
        platform_direct_mix_pct: 0,
      },
      {
        rent_amount: null,
        rental_type: 'short_term',
        nightly_rate_low: 60,
        occupancy_rate_pct: 70,
        avg_stay_nights: 3,
        platform_airbnb_pct: 15,
        platform_airbnb_mix_pct: 100,
        platform_booking_mix_pct: 0,
        platform_direct_mix_pct: 0,
      },
    ]
    const k = computeShortTermKpisForProperty(lots)
    expect(k.hasShortTermLots).toBe(true)
    expect(k.nbShortTermLots).toBe(2)
    expect(k.totalDaysAvailable).toBe(365 * 2)
    expect(k.grossRevenueTotal).toBeGreaterThan(0)
    // Le tarif moyen pondéré doit etre entre 60 et 80 (les deux lots à occupation égale)
    expect(k.avgNightlyRate).toBeGreaterThan(60)
    expect(k.avgNightlyRate).toBeLessThan(80)
  })

  it('mixed : compte un lot mixed dans les KPIs courte duree', () => {
    const lots: DbLot[] = [
      {
        rent_amount: 500,
        rental_type: 'mixed',
        nightly_rate_low: 70,
        occupancy_rate_pct: 40,  // saisonnier limite
        avg_stay_nights: 3,
        platform_airbnb_pct: 15,
        platform_airbnb_mix_pct: 100,
        platform_booking_mix_pct: 0,
        platform_direct_mix_pct: 0,
      },
    ]
    const k = computeShortTermKpisForProperty(lots)
    expect(k.hasShortTermLots).toBe(true)
    expect(k.nbShortTermLots).toBe(1)
  })
})

describe('computeMonthlyRentForLot', () => {
  it('long_term : retourne rent_amount tel quel', () => {
    expect(computeMonthlyRentForLot({ rent_amount: 850 })).toBe(850)
    expect(computeMonthlyRentForLot({
      rent_amount: 900,
      rental_type: 'long_term',
    })).toBe(900)
  })

  it('short_term : retourne netOwnerRevenueTotal / 12', () => {
    const monthlyRent = computeMonthlyRentForLot({
      rent_amount: null,
      rental_type: 'short_term',
      nightly_rate_low: 100,
      occupancy_rate_pct: 70,
      avg_stay_nights: 3,
      platform_airbnb_pct: 15,
      platform_airbnb_mix_pct: 100,
      platform_booking_mix_pct: 0,
      platform_direct_mix_pct: 0,
    })
    // Estimation : ~255 jours × 100 € = 25 500 € brut, -15% = 21 675, /12 ~ 1806
    expect(monthlyRent).toBeGreaterThan(1500)
    expect(monthlyRent).toBeLessThan(2200)
  })

  it('mixed : cumule rent_amount + short-term monthly', () => {
    const ltOnly = computeMonthlyRentForLot({
      rent_amount: 500,
      rental_type: 'long_term',
    })
    const mixed = computeMonthlyRentForLot({
      rent_amount: 500,
      rental_type: 'mixed',
      nightly_rate_low: 80,
      occupancy_rate_pct: 40,
      avg_stay_nights: 3,
      platform_airbnb_pct: 15,
      platform_airbnb_mix_pct: 100,
      platform_booking_mix_pct: 0,
      platform_direct_mix_pct: 0,
    })
    expect(mixed).toBeGreaterThan(ltOnly)
  })

  it('short_term sans nightly_rate_low : retourne rent_amount (fallback)', () => {
    expect(computeMonthlyRentForLot({
      rent_amount: 700,
      rental_type: 'short_term',
      nightly_rate_low: null,
    })).toBe(700)
  })
})
