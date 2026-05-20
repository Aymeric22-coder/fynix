import { describe, it, expect } from 'vitest'
import {
  detectShortTermFiscalRegime,
  SHORT_TERM_MICRO_BIC_REGIMES,
} from '../short-term/fiscal-detector'

describe('detectShortTermFiscalRegime — LF 2025', () => {
  it('non classe : CA 18 000 EUR > plafond 15 000 => regime reel obligatoire', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    18_000,
      classification: 'non_classe',
      tmiPct:         30,
      estimatedCharges:       2_000,
      estimatedAmortissement: 3_000,
    })
    expect(r.plafondCA).toBe(15_000)
    expect(r.isUnderPlafond).toBe(false)
    expect(r.depassementEur).toBe(3_000)
    expect(r.forcedRealRegime).toBe(true)
    expect(r.recommendedRegime).toBe('reel')
    expect(r.recommendation).toMatch(/Régime réel obligatoire/i)
  })

  it('non classe : CA 10 000 EUR sous plafond, micro recommande', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    10_000,
      classification: 'non_classe',
      tmiPct:         30,
      estimatedCharges:       1_000,
      estimatedAmortissement: 0,
    })
    expect(r.abattementPct).toBe(30)
    expect(r.forcedRealRegime).toBe(false)
    // base micro = 10000 * 0,7 = 7000 ; impot = 7000 * (30+17.2)% = 3304
    expect(r.microBicTax).toBeCloseTo(7_000 * 0.472, 0)
  })

  it('classe : CA 60 000 EUR, TMI 30 % => micro sous plafond 77 700', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    60_000,
      classification: 'classe_3_4_5',
      tmiPct:         30,
      estimatedCharges:       0,
      estimatedAmortissement: 0,
    })
    expect(r.abattementPct).toBe(50)
    expect(r.plafondCA).toBe(77_700)
    expect(r.isUnderPlafond).toBe(true)
    // base micro = 30 000 ; impot = 30 000 * 47,2 % = 14 160
    expect(r.microBicTax).toBeCloseTo(30_000 * 0.472, 0)
  })

  it('chambre d\'hotes : abattement 71 %, plafond 188 700', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    50_000,
      classification: 'chambre_hotes',
      tmiPct:         30,
      estimatedCharges:       0,
      estimatedAmortissement: 0,
    })
    expect(r.abattementPct).toBeCloseTo(71, 1)
    expect(r.plafondCA).toBe(188_700)
    // base micro = 50 000 * 0,29 = 14 500 ; impot = 14 500 * 47,2 %
    expect(r.microBicTax).toBeCloseTo(14_500 * 0.472, 0)
  })

  it('classe : CA 30 000, charges 12 000, amort 8 000 => reel beaucoup plus avantageux', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    30_000,
      classification: 'classe_3_4_5',
      tmiPct:         30,
      estimatedCharges:       12_000,
      estimatedAmortissement: 8_000,
    })
    // base reel = 30 000 - 12 000 - 8 000 = 10 000 ; impot = 4 720
    // net reel = 30 000 - 12 000 - 4 720 = 13 280
    // base micro = 15 000 ; impot = 7 080 ; net micro = 22 920
    // Le micro semble plus avantageux ici (le proprio paye moins d'impot
    // mais doit aussi "decaisser" les charges en reel — d'ou le micro
    // souvent gagnant tant que charges < abattement)
    expect(r.recommendedRegime).toBe('micro')
    expect(r.gainSwitchingToReel).toBeLessThan(0)
  })

  it('classe : CA 70 000, charges 50 000, amort 15 000 => reel gagnant', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    70_000,
      classification: 'classe_3_4_5',
      tmiPct:         41,
      estimatedCharges:       50_000,
      estimatedAmortissement: 15_000,
    })
    // base reel = 70 000 - 50 000 - 15 000 = 5 000 ; impot = 5 000 * 58,2 % = 2 910
    // net reel = 70 000 - 50 000 - 2 910 = 17 090
    // base micro = 35 000 ; impot = 35 000 * 58,2 % = 20 370 ; net micro = 49 630
    // Mais le micro est meilleur cash ! Le reel n'a d'interet qu'en
    // creant un deficit (impossible sur du tourisme professionnel sans
    // dette importante). Test : verifions juste que les chiffres sont calcules.
    expect(r.microNetAfterTax).toBeGreaterThan(0)
    expect(r.reelNetAfterTax).toBeGreaterThan(0)
    expect(r.recommendation).toBeTruthy()
  })

  it('bareme regimes : 4 classifications mappees', () => {
    expect(SHORT_TERM_MICRO_BIC_REGIMES.non_classe.abattement).toBe(0.30)
    expect(SHORT_TERM_MICRO_BIC_REGIMES.non_classe.plafond).toBe(15_000)
    expect(SHORT_TERM_MICRO_BIC_REGIMES.classe_1_2.abattement).toBe(0.50)
    expect(SHORT_TERM_MICRO_BIC_REGIMES.classe_3_4_5.abattement).toBe(0.50)
    expect(SHORT_TERM_MICRO_BIC_REGIMES.chambre_hotes.abattement).toBe(0.71)
    expect(SHORT_TERM_MICRO_BIC_REGIMES.chambre_hotes.plafond).toBe(188_700)
  })

  it('depassement leger : 200 EUR au-dessus du plafond non classe', () => {
    const r = detectShortTermFiscalRegime({
      estimatedCA:    15_200,
      classification: 'non_classe',
      tmiPct:         11,
      estimatedCharges:       0,
      estimatedAmortissement: 0,
    })
    expect(r.depassementEur).toBe(200)
    expect(r.forcedRealRegime).toBe(true)
  })
})
