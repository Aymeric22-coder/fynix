import { describe, it, expect } from 'vitest'
import { resolveMwrDisplay, formatMwrPeriodLabel } from '../mwr-display'
import type { MwrDetailed } from '../analytics'

function detailed(periodDays: number): MwrDetailed {
  return { annualized: 1.5, absolute: 0.05, periodDays }
}

describe('formatMwrPeriodLabel', () => {
  it('annualisé : libellé fixe quel que soit periodDays', () => {
    expect(formatMwrPeriodLabel(365, true)).toBe('annualisé')
    expect(formatMwrPeriodLabel(14, true)).toBe('annualisé')
  })

  it('< 60 j : « sur N j »', () => {
    expect(formatMwrPeriodLabel(14, false)).toBe('sur 14 j')
    expect(formatMwrPeriodLabel(59, false)).toBe('sur 59 j')
  })

  it('>= 60 j : « sur N mois » (round periodDays/30)', () => {
    expect(formatMwrPeriodLabel(60, false)).toBe('sur 2 mois')   // bordure : 2 mois, pas 60 j
    expect(formatMwrPeriodLabel(90, false)).toBe('sur 3 mois')
    expect(formatMwrPeriodLabel(179, false)).toBe('sur 6 mois')
  })
})

describe('resolveMwrDisplay', () => {
  it('null en entrée → null', () => {
    expect(resolveMwrDisplay(null)).toBeNull()
  })

  it('fenêtre < 180 j → valeur absolue, non annualisée, libellé période', () => {
    const r14 = resolveMwrDisplay(detailed(14))!
    expect(r14.isAnnualized).toBe(false)
    expect(r14.value).toBe(0.05)            // valeur absolue
    expect(r14.periodLabel).toBe('sur 14 j')

    const r60 = resolveMwrDisplay(detailed(60))!
    expect(r60.isAnnualized).toBe(false)
    expect(r60.periodLabel).toBe('sur 2 mois')

    const r179 = resolveMwrDisplay(detailed(179))!
    expect(r179.isAnnualized).toBe(false)
    expect(r179.periodLabel).toBe('sur 6 mois')
  })

  it('bordure : exactement 180 j → annualisé', () => {
    const r = resolveMwrDisplay(detailed(180))!
    expect(r.isAnnualized).toBe(true)
    expect(r.value).toBe(1.5)               // valeur annualisée
    expect(r.periodLabel).toBe('annualisé')
  })

  it('fenêtre longue (365 j) → annualisé', () => {
    const r = resolveMwrDisplay(detailed(365))!
    expect(r.isAnnualized).toBe(true)
    expect(r.periodLabel).toBe('annualisé')
  })
})
