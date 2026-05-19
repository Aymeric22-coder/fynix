import { describe, it, expect } from 'vitest'
import { compareRegimes } from '../fiscal/compare-regimes'
import type { SimulationInput } from '../types'

/** Bien locatif meublé typique : LMNP réel devrait gagner. */
const BASE: Omit<SimulationInput, 'regime'> = {
  property: {
    purchasePrice:    200_000,
    notaryFees:       16_000,
    worksAmount:      0,
    propertyIndexPct: 1,
  },
  loan: {
    principal:        180_000,
    annualRatePct:    3.5,
    durationYears:    20,
    insuranceRatePct: 0.2,
    bankFees:         800,
    guaranteeFees:    1_500,
    startDate:        new Date('2024-01-01'),
  },
  rent: {
    monthlyRent:    900,
    vacancyMonths:  0.3,
    rentalIndexPct: 1.5,
  },
  charges: {
    pno: 400, gliPct: 0, propertyTax: 1_500, cfe: 300, accountant: 0,
    condoFees: 600, managementPct: 0, maintenance: 300, other: 0,
    chargesIndexPct: 1.5,
  },
  downPayment: 36_300,
  horizonYears: 10,
}

describe('compareRegimes', () => {
  it('produit une ligne par régime (7)', () => {
    const result = compareRegimes(BASE, { tmiPct: 30 })
    expect(result.rows).toHaveLength(7)
  })

  it('identifie un meilleur régime (cash-flow le plus élevé)', () => {
    const result = compareRegimes(BASE, { tmiPct: 30 })
    expect(result.bestRegime).not.toBeNull()
    const best = result.rows.find(r => r.recommended)
    expect(best).toBeDefined()
    // bestRow.annualNetCashFlow doit être >= toutes les autres applicables
    const others = result.rows.filter(r => !r.notApplicable && !r.recommended)
    others.forEach(o =>
      expect(best!.annualNetCashFlow).toBeGreaterThanOrEqual(o.annualNetCashFlow),
    )
  })

  it('pour un bien meublé typique avec amortissements importants, LMNP réel ou LMP est généralement préféré', () => {
    const result = compareRegimes(BASE, { tmiPct: 30 })
    // On vérifie au moins que le best n'est PAS un régime micro foncier
    // (le micro foncier ne permet pas d'amortir et impose 70 % du loyer).
    expect(result.bestRegime).not.toBe('foncier_micro')
  })

  it('respecte le paramètre applicableRegimes', () => {
    const result = compareRegimes(BASE, {
      tmiPct: 30,
      applicableRegimes: ['lmnp_micro', 'lmnp_reel'],
    })
    const applicable = result.rows.filter(r => !r.notApplicable)
    expect(applicable.map(r => r.regime).sort()).toEqual(['lmnp_micro', 'lmnp_reel'])
    // Les autres régimes sont marqués notApplicable
    expect(result.rows.find(r => r.regime === 'foncier_nu')?.notApplicable).toBe(true)
  })

  it('expose label, taux et net yield', () => {
    const result = compareRegimes(BASE, { tmiPct: 30 })
    const lmnpReel = result.rows.find(r => r.regime === 'lmnp_reel')!
    expect(lmnpReel.label).toBe('LMNP réel')
    expect(lmnpReel.annualGrossRent).toBeGreaterThan(0)
    expect(typeof lmnpReel.netYieldPct).toBe('number')
  })
})
