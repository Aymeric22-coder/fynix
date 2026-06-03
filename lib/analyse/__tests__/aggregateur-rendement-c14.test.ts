/**
 * Test du fix C14 — `rendementEstime` consomme le taux moyen pondéré
 * réel du cash plutôt que la constante `RENDEMENT_PAR_CLASSE.cash`
 * (Cash Refactor V1.0).
 *
 * Le helper `rendementEstime` est exporté par `aggregateur.ts`
 * spécifiquement pour ce test. La signature accepte désormais un
 * 5e argument `tauxCashDecimal: number | null`.
 *
 * Écart attendu sur les fixtures Dashboard existantes :
 *   - Fixture `debutant` : 12 000 € sur Livret A. Avant : 3 % (constante).
 *     Après : taux réel du LA si saisi (le wizard met 3 % par défaut).
 *     **Écart attendu = 0** tant que l'utilisateur garde le taux par défaut.
 *   - Fixture `hnw-complexe` : cash dispersé sur plusieurs livrets. Selon
 *     les taux réels, l'écart peut être de quelques dixièmes de point %.
 *   - Aucune fixture n'écrit dans `cash_accounts.interest_rate`
 *     directement (fixtures Dashboard manipulent `assets`), donc aucun
 *     snapshot n'est invalidé par cette PR.
 *
 * En production, l'écart sera réel : un utilisateur avec LEP 4 % et CEL
 * 2 % verra son rendement patrimonial évoluer par rapport au 3 % en dur.
 */
import { describe, it, expect } from 'vitest'
import { rendementEstime } from '../aggregateur'
import type { EnrichedPosition, BienImmo } from '@/types/analyse'

const NO_POSITIONS: EnrichedPosition[] = []
const NO_BIENS:     BienImmo[]         = []

describe('rendementEstime — fix C14 (taux cash réel)', () => {
  it('Sans comptes cash (tauxCashDecimal=null) → fallback RENDEMENT_PAR_CLASSE.cash (3 %)', () => {
    // total = 100k, cash = 10k → contrib cash = (0.1) × 3 % = 0,3 %
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 10_000, 100_000, null)
    expect(r).toBe(0.3)
  })

  it('Argument tauxCashDecimal omis → fallback préservé (rétro-compat)', () => {
    // L'argument est optionnel ; pas de paramètre = même comportement que null
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 10_000, 100_000)
    expect(r).toBe(0.3)
  })

  it('1 compte à 4 % (totalCash=10k, total=100k) → contribution cash = 0,4 %', () => {
    // Nouveau comportement : (10k/100k) × 4 = 0,4 (et non 0,3 de l'ancien)
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 10_000, 100_000, 0.04)
    expect(r).toBe(0.4)
  })

  it('Taux pondéré ≈ 3,33 % (mix LA 3 % + LEP 4 %) → utilisé tel quel', () => {
    // Σ rate × balance = 300 + 200 = 500 ; Σ balance = 15 000 → 3,333…%
    const tauxMoyenPondereDecimal = 500 / 15_000 // ≈ 0.033333
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 15_000, 100_000, tauxMoyenPondereDecimal)
    // contribution = (15/100) × 3,333… = 0,5
    expect(r).toBeCloseTo(0.5, 6)
  })

  it('Taux pondéré = 0 (utilisateur a déclaré du cash à 0 %) → respecté, pas de fallback', () => {
    // Nouveau comportement strict : si l'utilisateur dit 0 %, on l'écoute.
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 10_000, 100_000, 0)
    // contribution cash = 0 (pas de 3 % de fallback parasite)
    expect(r).toBe(0)
  })

  it('total <= 0 → 0 (cas dégénéré préservé)', () => {
    expect(rendementEstime(NO_POSITIONS, NO_BIENS, 0, 0, 0.03)).toBe(0)
    expect(rendementEstime(NO_POSITIONS, NO_BIENS, 0, -100, 0.03)).toBe(0)
  })

  it('totalCash = 0 (utilisateur sans cash) → contribution cash = 0 quel que soit le taux', () => {
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 0, 100_000, 0.04)
    expect(r).toBe(0)
  })

  it('Moyenne pondérée ≠ moyenne arithmétique (gros compte à 3 % + petit à 6 %)', () => {
    // 90k à 3 % + 10k à 6 % :
    //   - Moyenne arithmétique naïve : (3 + 6) / 2 = 4,5 % (FAUX)
    //   - Moyenne pondérée : (90 × 3 + 10 × 6) / 100 = 3,3 % (juste)
    const tauxMoyenPondereDecimal = (90_000 * 0.03 + 10_000 * 0.06) / 100_000
    expect(tauxMoyenPondereDecimal).toBeCloseTo(0.033, 6)
    // Contribution sur 100k cash dans 200k total : (100/200) × 3,3 = 1,65
    const r = rendementEstime(NO_POSITIONS, NO_BIENS, 100_000, 200_000, tauxMoyenPondereDecimal)
    expect(r).toBe(1.65)
  })
})
