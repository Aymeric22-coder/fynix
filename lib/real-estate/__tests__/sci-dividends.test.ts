import { describe, it, expect } from 'vitest'
import { computeDividendDistribution } from '../fiscal/sci-is'

describe('computeDividendDistribution — CGI art. 200 A', () => {
  it('TMI 11 % : barème plus avantageux que PFU', () => {
    // PFU = 30 %, barème = 11×0.6 + 17.2 = 6.6 + 17.2 = 23.8 %
    const r = computeDividendDistribution({
      netProfitAfterIS:  4_200,
      dividendAmount:    4_200,
      ccaAmount:         0,
      availableCashYear: 0,
      tmiPct:            11,
    })
    expect(r.optimalOption).toBe('bareme')
    expect(r.pfuTax).toBeCloseTo(1_260, 2)        // 4200 × 0,30
    expect(r.netAfterPfu).toBeCloseTo(2_940, 2)
    // Barème = 4200×0,6×0,11 + 4200×0,172 = 277,2 + 722,4 = 999,6
    expect(r.baremeTax).toBeCloseTo(999.6, 1)
    expect(r.netAfterBareme).toBeCloseTo(3_200.4, 1)
  })

  it('TMI 30 % : seuil quasi à égalité (barème encore légèrement meilleur)', () => {
    // Barème = 30×0,6 + 17,2 = 18 + 17,2 = 35,2 % > 30 % PFU
    // Donc PFU optimal à TMI 30 %
    const r = computeDividendDistribution({
      netProfitAfterIS: 5_000, dividendAmount: 5_000,
      ccaAmount: 0, availableCashYear: 0, tmiPct: 30,
    })
    expect(r.optimalOption).toBe('pfu')
    expect(r.netAfterPfu).toBeGreaterThan(r.netAfterBareme)
  })

  it('TMI 41 % : PFU systématiquement plus avantageux', () => {
    // Barème = 41×0,6 + 17,2 = 24,6 + 17,2 = 41,8 % >> 30 % PFU
    const r = computeDividendDistribution({
      netProfitAfterIS: 10_000, dividendAmount: 10_000,
      ccaAmount: 0, availableCashYear: 0, tmiPct: 41,
    })
    expect(r.optimalOption).toBe('pfu')
    expect(r.netAfterPfu).toBeCloseTo(7_000, 2)   // 10000 × 0,70
    expect(r.baremeTax).toBeCloseTo(4_180, 1)
  })

  it('CCA partiellement disponible : capping correct par le cash', () => {
    // Le CCA dispo (10 000 €) excède le cash dispo (4 200 €) :
    // remboursement plafonné par le cash, pas par le bénéfice.
    const r = computeDividendDistribution({
      netProfitAfterIS: 4_200, dividendAmount: 0,
      ccaAmount: 10_000, availableCashYear: 4_200, tmiPct: 30,
    })
    expect(r.ccaReimbursement).toBe(4_200)
    expect(r.ccaCapped).toBe(true)
    expect(r.ccaAvailable).toBe(10_000)
  })

  it('CCA inférieur au cash : tout est remboursable', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS: 10_000, dividendAmount: 0,
      ccaAmount: 3_000, availableCashYear: 10_000, tmiPct: 30,
    })
    expect(r.ccaReimbursement).toBe(3_000)
    expect(r.ccaCapped).toBe(false)
  })

  it('dividende négatif → ramené à 0', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS: 5_000, dividendAmount: -100,
      ccaAmount: 0, availableCashYear: 0, tmiPct: 30,
    })
    expect(r.dividendAmount).toBe(0)
    expect(r.pfuTax).toBe(0)
    expect(r.netAfterPfu).toBe(0)
  })

  // ── Nouveau plafond cash (vs ancien plafond bénéfice) ────────────────

  it('SCI fortement amortie : bénéfice ≈ 0 mais cash positif → CCA remboursable', () => {
    // Cas typique d'une SCI à l'IS dont les amortissements neutralisent
    // le résultat fiscal. Avant le fix : ccaReimbursement = 0 (plafonné
    // au bénéfice). Après : remboursable sur le cash-flow réel.
    const r = computeDividendDistribution({
      netProfitAfterIS:  0,
      dividendAmount:    0,
      ccaAmount:         8_000,
      availableCashYear: 5_400,
      tmiPct:            30,
    })
    expect(r.ccaReimbursement).toBe(5_400)
    expect(r.ccaCapped).toBe(true)             // 8 000 > 5 400 → plafonné cash
    expect(r.ccaAvailable).toBe(8_000)
  })

  it('cash-flow négatif (année déficitaire) → CCA non remboursable', () => {
    // Cash-flow négatif = la SCI ne dégage pas de quoi se rembourser
    // l'associé cette année. Le solde de CCA reste dû mais n'est pas
    // mobilisable. Ramené à 0 par max(0, availableCashYear).
    const r = computeDividendDistribution({
      netProfitAfterIS:  2_000,        // bénéfice mais pas de cash
      dividendAmount:    0,
      ccaAmount:         10_000,
      availableCashYear: -1_500,
      tmiPct:            30,
    })
    expect(r.ccaReimbursement).toBe(0)
    expect(r.ccaCapped).toBe(true)
  })

  it('CCA vide : ccaReimbursement = 0 même si cash dispo', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS:  3_000,
      dividendAmount:    3_000,
      ccaAmount:         0,
      availableCashYear: 5_000,
      tmiPct:            30,
    })
    expect(r.ccaReimbursement).toBe(0)
    expect(r.ccaCapped).toBe(false)
    expect(r.ccaAvailable).toBe(0)
  })

  it('CCA négatif (saisie corrompue) → ramené à 0', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS:  3_000,
      dividendAmount:    0,
      ccaAmount:         -500,
      availableCashYear: 1_000,
      tmiPct:            30,
    })
    expect(r.ccaReimbursement).toBe(0)
    expect(r.ccaAvailable).toBe(0)
  })
})
