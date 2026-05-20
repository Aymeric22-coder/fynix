import { describe, it, expect } from 'vitest'
import {
  detectLmpStatus,
  sumMeubleeRevenues,
  LMP_REVENUE_THRESHOLD,
} from '../fiscal/lmp-detector'

describe('detectLmpStatus — CGI art. 151 septies', () => {
  it('LMNP si recettes ≤ 23 000 € (condition 1 false)', () => {
    const r = detectLmpStatus(20_000, { professionalIncomeEur: 30_000 })
    expect(r.isLmp).toBe(false)
    expect(r.condition1Met).toBe(false)
    expect(r.recommendation).toContain('LMNP')
  })

  it('LMNP si recettes > 23 000 mais ≤ revenus pro (condition 2 false)', () => {
    const r = detectLmpStatus(25_000, { professionalIncomeEur: 30_000 })
    expect(r.isLmp).toBe(false)
    expect(r.condition1Met).toBe(true)
    expect(r.condition2Met).toBe(false)
  })

  it('LMP si les deux conditions sont vraies', () => {
    const r = detectLmpStatus(25_000, { professionalIncomeEur: 20_000 })
    expect(r.isLmp).toBe(true)
    expect(r.condition1Met).toBe(true)
    expect(r.condition2Met).toBe(true)
    expect(r.recommendation).toContain('LMP')
  })

  it('LMNP si recettes = 23 000 € pile (seuil strict, > non >=)', () => {
    const r = detectLmpStatus(23_000, { professionalIncomeEur: 10_000 })
    expect(r.isLmp).toBe(false)
    expect(r.condition1Met).toBe(false)
  })

  it('LMP si recettes = 23 001 € et revenus pro inférieurs', () => {
    const r = detectLmpStatus(23_001, { professionalIncomeEur: 20_000 })
    expect(r.isLmp).toBe(true)
  })

  it('expose le seuil légal 23 000 € dans la réponse', () => {
    const r = detectLmpStatus(0, { professionalIncomeEur: 0 })
    expect(r.threshold).toBe(LMP_REVENUE_THRESHOLD)
    expect(r.threshold).toBe(23_000)
  })
})

describe('sumMeubleeRevenues — agrégation cross-biens', () => {
  it('somme uniquement les biens en régime meublé', () => {
    const total = sumMeubleeRevenues([
      { fiscal_regime: 'lmnp_reel',  annualMeubleeRevenues: 10_000 },
      { fiscal_regime: 'lmnp_micro', annualMeubleeRevenues:  8_000 },
      { fiscal_regime: 'lmp',        annualMeubleeRevenues: 12_000 },
      { fiscal_regime: 'foncier_nu', annualMeubleeRevenues:  9_000 },  // exclus
      { fiscal_regime: 'sci_is',     annualMeubleeRevenues:  5_000 },  // exclus
      { fiscal_regime: null,         annualMeubleeRevenues:  3_000 },  // exclus
    ])
    expect(total).toBe(30_000)
  })

  it('retourne 0 si aucun bien meublé', () => {
    const total = sumMeubleeRevenues([
      { fiscal_regime: 'foncier_nu', annualMeubleeRevenues: 9_000 },
    ])
    expect(total).toBe(0)
  })

  it('ignore les valeurs nulles ou indéfinies', () => {
    const total = sumMeubleeRevenues([
      { fiscal_regime: 'lmnp_reel', annualMeubleeRevenues: 0 },
      { fiscal_regime: 'lmnp_reel', annualMeubleeRevenues: 5_000 },
    ])
    expect(total).toBe(5_000)
  })
})
