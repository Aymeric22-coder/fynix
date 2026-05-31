/**
 * CS2 LOT 1 — Tests de l'inclusion crypto dans `calculerRendementPortefeuille`.
 *
 * Garantit :
 *   - 0 % crypto → comportement strictement identique à pré-CS2 (non-régression).
 *   - 10 % / 30 % / 50 % crypto → rendement moyen pondéré tire vers 4 %
 *     (CRYPTO_RENDEMENT_CENTRAL_PCT), au lieu d'être ignoré.
 *   - Profil 100 % crypto → rendement = 4 %.
 */
import { describe, it, expect } from 'vitest'
import { calculerRendementPortefeuille } from '../projectionFIRE'
import { CRYPTO_RENDEMENT_CENTRAL_PCT } from '@/lib/profil/cryptoConstants'
import type { EnrichedPosition, PatrimoineComplet } from '@/types/analyse'

function pos(asset_type: EnrichedPosition['asset_type'], current_value: number): EnrichedPosition {
  return {
    asset_type,
    current_value,
    // Champs minimaux requis pour le type — non utilisés par calculerRendementPortefeuille
  } as unknown as EnrichedPosition
}

function patrimoine(positions: EnrichedPosition[], totalImmo = 0, totalCash = 0): PatrimoineComplet {
  return { positions, totalImmo, totalCash } as unknown as PatrimoineComplet
}

// Rendements de référence pris dans lib/analyse/constants.ts (RENDEMENT_PAR_CLASSE).
// stock 7 %, etf 7 %, crypto 4 % (post-CS2).
const ETF_PCT    = 7
const CRYPTO_PCT = CRYPTO_RENDEMENT_CENTRAL_PCT

describe('CS2 LOT 1 — calculerRendementPortefeuille avec crypto', () => {
  it('0 % crypto (ETF seul) → rendement = ETF_PCT (non-régression)', () => {
    const p = patrimoine([pos('etf', 10_000)])
    expect(calculerRendementPortefeuille(p)).toBeCloseTo(ETF_PCT, 1)
  })

  it('10 % crypto + 90 % ETF → moyenne pondérée tire vers ~6,7 %', () => {
    const p = patrimoine([
      pos('etf', 9_000),
      pos('crypto', 1_000),
    ])
    // (9000*7 + 1000*4) / 10000 = (63000 + 4000) / 10000 = 6.7
    const expected = (9_000 * ETF_PCT + 1_000 * CRYPTO_PCT) / 10_000
    expect(calculerRendementPortefeuille(p)).toBeCloseTo(expected, 1)
  })

  it('30 % crypto + 70 % ETF → moyenne pondérée ~6,1 %', () => {
    const p = patrimoine([
      pos('etf', 7_000),
      pos('crypto', 3_000),
    ])
    // (7000*7 + 3000*4) / 10000 = (49000 + 12000) / 10000 = 6.1
    const expected = (7_000 * ETF_PCT + 3_000 * CRYPTO_PCT) / 10_000
    expect(calculerRendementPortefeuille(p)).toBeCloseTo(expected, 1)
  })

  it('50 % crypto + 50 % ETF → moyenne pondérée = 5,5 %', () => {
    const p = patrimoine([
      pos('etf', 5_000),
      pos('crypto', 5_000),
    ])
    const expected = (ETF_PCT + CRYPTO_PCT) / 2
    expect(calculerRendementPortefeuille(p)).toBeCloseTo(expected, 1)
  })

  it('100 % crypto → rendement = 4 % (CRYPTO_RENDEMENT_CENTRAL_PCT)', () => {
    const p = patrimoine([pos('crypto', 10_000)])
    expect(calculerRendementPortefeuille(p)).toBeCloseTo(CRYPTO_PCT, 1)
  })

  it('avant CS2 : crypto seule retournait 0 (denom=0) — bug latent fixé', () => {
    // Régression positive : avant CS2, ce cas retournait 0 (denom resterait
    // à zéro après le skip). Maintenant, on retourne le taux crypto.
    const p = patrimoine([pos('crypto', 5_000)])
    expect(calculerRendementPortefeuille(p)).not.toBe(0)
    expect(calculerRendementPortefeuille(p)).toBeCloseTo(CRYPTO_PCT, 1)
  })
})
