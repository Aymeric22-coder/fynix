/**
 * Tests TAX — estimation indicative fiscalite par enveloppe.
 *
 * Couvre le modele valide :
 *  - CTO / crypto : PFU 30 %
 *  - PEA < 5 ans vs >= 5 ans (PS 17,2 %)
 *  - AV < 8 ans vs >= 8 ans (abattement seul / couple + 24,7 %)
 *  - Repartition prorata de l'abattement AV sur 2 contrats
 *  - PER → null ; other → null (pas de PFU par defaut)
 *  - PV <= 0 → impot 0
 *  - opening_date manquante → PFU 30 % + note
 *  - detection couple : situation_familiale puis fallback parts
 */

import { describe, it, expect } from 'vitest'
import {
  estimateEnvelopeTax,
  estimatePortfolioTax,
  type EnvelopeTaxInput,
  type FoyerFiscalContext,
} from '../tax-estimate'

const NOW = new Date('2026-06-15T12:00:00Z')
const SEUL: FoyerFiscalContext   = { situationFamiliale: 'Célibataire',     foyerFiscalParts: 1 }
const COUPLE: FoyerFiscalContext = { situationFamiliale: 'Marié(e) / PACS', foyerFiscalParts: 2 }

function env(over: Partial<EnvelopeTaxInput> & { envelopeType: string }): EnvelopeTaxInput {
  return {
    envelopeId:     'env-1',
    envelopeLabel:  'Test',
    openingDate:    null,
    realizedPnlTtm: 1000,
    ...over,
  }
}

// ─── estimateEnvelopeTax (unitaire) ──────────────────────────────────────────

describe('estimateEnvelopeTax — CTO / crypto', () => {
  it('CTO : PFU 30 %, pas de note majorant', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'cto', realizedPnlTtm: 1000 }), NOW)
    expect(r.estimatedTax).toBeCloseTo(300, 6)
    expect(r.taxableBase).toBe(1000)
    expect(r.effectiveRate).toBeCloseTo(0.30, 6)
    expect(r.regimeLabel).toBe('PFU 30 %')
    expect(r.isEstimable).toBe(true)
    expect(r.notes).toHaveLength(0)  // CTO : cession reellement imposable, pas de majorant
  })

  it('Crypto : PFU 30 %', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'wallet_crypto', realizedPnlTtm: 2000 }), NOW)
    expect(r.estimatedTax).toBeCloseTo(600, 6)
    expect(r.regimeLabel).toContain('150 VH bis')
  })
})

describe('estimateEnvelopeTax — PEA', () => {
  it('< 5 ans : PFU 30 % + note majorant', () => {
    const r = estimateEnvelopeTax(env({
      envelopeType: 'pea', realizedPnlTtm: 1000,
      openingDate: '2024-01-01',  // ~2,5 ans avant NOW
    }), NOW)
    expect(r.estimatedTax).toBeCloseTo(300, 6)
    expect(r.regimeLabel).toContain('< 5 ans')
    expect(r.notes.some((n) => n.toLowerCase().includes('majorant'))).toBe(true)
  })

  it('>= 5 ans : PS 17,2 % seulement (IR exonéré) + majorant', () => {
    const r = estimateEnvelopeTax(env({
      envelopeType: 'pea', realizedPnlTtm: 1000,
      openingDate: '2018-01-01',  // ~8 ans
    }), NOW)
    expect(r.estimatedTax).toBeCloseTo(172, 6)
    expect(r.effectiveRate).toBeCloseTo(0.172, 6)
    expect(r.regimeLabel).toContain('> 5 ans')
    expect(r.notes.some((n) => n.toLowerCase().includes('majorant'))).toBe(true)
  })

  it('opening_date absente : PFU 30 % + note ancienneté inconnue', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'pea', realizedPnlTtm: 1000, openingDate: null }), NOW)
    expect(r.estimatedTax).toBeCloseTo(300, 6)
    expect(r.notes.some((n) => n.toLowerCase().includes('ancienneté') || n.toLowerCase().includes('anciennete') || n.includes('absente'))).toBe(true)
  })
})

describe('estimateEnvelopeTax — Assurance-Vie', () => {
  it('< 8 ans : PFU 30 %', () => {
    const r = estimateEnvelopeTax(env({
      envelopeType: 'assurance_vie', realizedPnlTtm: 1000,
      openingDate: '2020-01-01',  // ~6,5 ans
    }), NOW)
    expect(r.estimatedTax).toBeCloseTo(300, 6)
    expect(r.regimeLabel).toContain('< 8 ans')
  })

  it('>= 8 ans avec abattement seul (4 600 €) : (pv − 4600) × 24,7 %', () => {
    const r = estimateEnvelopeTax(
      env({ envelopeType: 'assurance_vie', realizedPnlTtm: 10000, openingDate: '2010-01-01' }),
      NOW,
      { avAbattementShare: 4600, foyerNote: 'Foyer célibataire' },
    )
    const expectedBase = 10000 - 4600
    expect(r.taxableBase).toBeCloseTo(expectedBase, 6)
    expect(r.estimatedTax).toBeCloseTo(expectedBase * (0.075 + 0.172), 6)
    expect(r.regimeLabel).toContain('> 8 ans')
  })

  it('>= 8 ans, abattement > PV : base clampée à 0, impôt 0', () => {
    const r = estimateEnvelopeTax(
      env({ envelopeType: 'assurance_vie', realizedPnlTtm: 3000, openingDate: '2010-01-01' }),
      NOW,
      { avAbattementShare: 4600 },
    )
    expect(r.taxableBase).toBe(0)
    expect(r.estimatedTax).toBe(0)
  })
})

describe('estimateEnvelopeTax — non estimables', () => {
  it('PER → null', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'per', realizedPnlTtm: 5000 }), NOW)
    expect(r.estimatedTax).toBeNull()
    expect(r.isEstimable).toBe(false)
    expect(r.regimeLabel).toContain('PER')
  })

  it('other → null (PAS de PFU 30 % par défaut)', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'other', realizedPnlTtm: 5000 }), NOW)
    expect(r.estimatedTax).toBeNull()
    expect(r.isEstimable).toBe(false)
  })

  it('type inconnu → null', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'livret_a' as string, realizedPnlTtm: 100 }), NOW)
    expect(r.estimatedTax).toBeNull()
    expect(r.isEstimable).toBe(false)
  })
})

describe('estimateEnvelopeTax — PV <= 0', () => {
  it('PV négative → impôt 0, isEstimable true', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'cto', realizedPnlTtm: -500 }), NOW)
    expect(r.estimatedTax).toBe(0)
    expect(r.isEstimable).toBe(true)
    expect(r.effectiveRate).toBeNull()
  })

  it('PV nulle → impôt 0', () => {
    const r = estimateEnvelopeTax(env({ envelopeType: 'pea', realizedPnlTtm: 0 }), NOW)
    expect(r.estimatedTax).toBe(0)
  })
})

// ─── estimatePortfolioTax (orchestration + prorata abattement AV) ────────────

describe('estimatePortfolioTax', () => {
  it('exclut les enveloppes sans PV réalisée (realizedPnlTtm null)', () => {
    const out = estimatePortfolioTax(
      [
        env({ envelopeId: 'a', envelopeType: 'cto', realizedPnlTtm: null }),
        env({ envelopeId: 'b', envelopeType: 'cto', realizedPnlTtm: 1000 }),
      ],
      SEUL, NOW,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.envelopeId).toBe('b')
  })

  it('abattement AV couple (9 200 €) réparti AU PRORATA sur 2 contrats ≥ 8 ans', () => {
    // 2 AV >= 8 ans : PV 6000 et 2000 → total 8000.
    // Abattement couple 9200 reparti : AV1 = 9200 × 6000/8000 = 6900,
    //                                  AV2 = 9200 × 2000/8000 = 2300.
    const out = estimatePortfolioTax(
      [
        env({ envelopeId: 'av1', envelopeType: 'assurance_vie', realizedPnlTtm: 6000, openingDate: '2010-01-01' }),
        env({ envelopeId: 'av2', envelopeType: 'assurance_vie', realizedPnlTtm: 2000, openingDate: '2012-01-01' }),
      ],
      COUPLE, NOW,
    )
    const av1 = out.find((e) => e.envelopeId === 'av1')!
    const av2 = out.find((e) => e.envelopeId === 'av2')!
    // base = pv − share
    expect(av1.taxableBase).toBeCloseTo(6000 - 6900 < 0 ? 0 : 6000 - 6900, 6) // 6000-6900<0 → 0
    expect(av1.taxableBase).toBe(0)        // 6900 > 6000 → clamp 0
    expect(av2.taxableBase).toBe(0)        // 2300 > 2000 → clamp 0
    // Somme des abattements alloués = 9200 (un seul abattement foyer)
    // (verifie indirectement : ici les deux bases tombent a 0)
  })

  it('abattement AV couple réparti — cas où la PV dépasse la part', () => {
    // 2 AV >= 8 ans : PV 40000 et 10000 → total 50000.
    // Couple 9200 : AV1 share = 9200 × 40000/50000 = 7360 → base 32640.
    //               AV2 share = 9200 × 10000/50000 = 1840 → base 8160.
    const out = estimatePortfolioTax(
      [
        env({ envelopeId: 'av1', envelopeType: 'assurance_vie', realizedPnlTtm: 40000, openingDate: '2010-01-01' }),
        env({ envelopeId: 'av2', envelopeType: 'assurance_vie', realizedPnlTtm: 10000, openingDate: '2012-01-01' }),
      ],
      COUPLE, NOW,
    )
    const av1 = out.find((e) => e.envelopeId === 'av1')!
    const av2 = out.find((e) => e.envelopeId === 'av2')!
    expect(av1.taxableBase).toBeCloseTo(40000 - 7360, 2)
    expect(av2.taxableBase).toBeCloseTo(10000 - 1840, 2)
    // Total abattement consommé = 7360 + 1840 = 9200 (un seul abattement foyer)
    const totalAbattementConsomme = (40000 - av1.taxableBase) + (10000 - av2.taxableBase)
    expect(totalAbattementConsomme).toBeCloseTo(9200, 2)
  })

  it('seul (4 600 €) : abattement réduit vs couple', () => {
    const out = estimatePortfolioTax(
      [env({ envelopeId: 'av1', envelopeType: 'assurance_vie', realizedPnlTtm: 40000, openingDate: '2010-01-01' })],
      SEUL, NOW,
    )
    expect(out[0]!.taxableBase).toBeCloseTo(40000 - 4600, 2)
  })

  it('fallback couple via foyer_fiscal_parts >= 2 quand situation absente', () => {
    const foyerSansSituation: FoyerFiscalContext = { situationFamiliale: null, foyerFiscalParts: 2 }
    const out = estimatePortfolioTax(
      [env({ envelopeId: 'av1', envelopeType: 'assurance_vie', realizedPnlTtm: 40000, openingDate: '2010-01-01' })],
      foyerSansSituation, NOW,
    )
    // Abattement couple 9200 applique via fallback parts
    expect(out[0]!.taxableBase).toBeCloseTo(40000 - 9200, 2)
    expect(out[0]!.notes.some((n) => n.toLowerCase().includes('part'))).toBe(true)
  })

  it("'En couple' (concubinage) = abattement individuel 4 600 € (foyers distincts)", () => {
    const concubinage: FoyerFiscalContext = { situationFamiliale: 'En couple', foyerFiscalParts: 2 }
    const out = estimatePortfolioTax(
      [env({ envelopeId: 'av1', envelopeType: 'assurance_vie', realizedPnlTtm: 40000, openingDate: '2010-01-01' })],
      concubinage, NOW,
    )
    expect(out[0]!.taxableBase).toBeCloseTo(40000 - 4600, 2)
  })

  it('mix complet : CTO + PEA>5 + AV>8 + PER + other', () => {
    const out = estimatePortfolioTax(
      [
        env({ envelopeId: 'cto',  envelopeType: 'cto',            realizedPnlTtm: 1000 }),
        env({ envelopeId: 'pea',  envelopeType: 'pea',            realizedPnlTtm: 2000, openingDate: '2015-01-01' }),
        env({ envelopeId: 'av',   envelopeType: 'assurance_vie',  realizedPnlTtm: 20000, openingDate: '2010-01-01' }),
        env({ envelopeId: 'per',  envelopeType: 'per',            realizedPnlTtm: 5000 }),
        env({ envelopeId: 'oth',  envelopeType: 'other',          realizedPnlTtm: 500 }),
      ],
      SEUL, NOW,
    )
    expect(out).toHaveLength(5)
    expect(out.find((e) => e.envelopeId === 'cto')!.estimatedTax).toBeCloseTo(300, 6)
    expect(out.find((e) => e.envelopeId === 'pea')!.estimatedTax).toBeCloseTo(2000 * 0.172, 6)
    expect(out.find((e) => e.envelopeId === 'av')!.taxableBase).toBeCloseTo(20000 - 4600, 6)
    expect(out.find((e) => e.envelopeId === 'per')!.estimatedTax).toBeNull()
    expect(out.find((e) => e.envelopeId === 'oth')!.estimatedTax).toBeNull()
  })
})
