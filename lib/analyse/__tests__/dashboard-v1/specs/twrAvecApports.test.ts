/**
 * Spec P0.3 — TWR vs Croissance patrimoniale : démonstration pédagogique
 * de la divergence (livré V1.3).
 *
 * Le TWR mesure la **performance pure** de l'investissement (apports
 * neutralisés). La croissance patrimoniale mesure **l'évolution globale du
 * patrimoine net**, apports d'épargne INCLUS. Sur un profil qui épargne
 * régulièrement, la croissance > TWR mécaniquement.
 *
 * Inversement, sur un profil dont les apports sont concentrés au sommet
 * d'une période volatile, le TWR peut sortir SUPÉRIEUR à la croissance —
 * preuve que la performance brute du marché valait plus que ce que l'effet
 * temps des apports a capturé. C'est précisément ce que matérialise la
 * fixture Diversifié (apports +30k au creux, +4k au rebond).
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ALL_FIXTURES } from '../fixtures'

const MIN_PP_GAP = 1.0  // > 1 pp = divergence considérée comme significative

describe('P0.3 — TWR ≠ Croissance patrimoine (démonstration formelle)', () => {
  it.each([
    ['patrimoine-diversifie' as const],
    ['preretraite' as const],
  ])('%s : |TWR − Croissance| > 1 pp', (id) => {
    const f = ALL_FIXTURES.find((x) => x.id === id)!
    const data = computeDashboardData(f.inputs)

    expect(data.kpis.twr_portefeuille_pct).not.toBeNull()
    expect(data.kpis.croissance_patrimoine_pct).not.toBeNull()

    const twr = data.kpis.twr_portefeuille_pct!
    const croissance = data.kpis.croissance_patrimoine_pct!
    const gap = Math.abs(twr - croissance)

    // Message d'assertion explicite — facilite la lecture des échecs
    // pédagogiques en cas de recalibrage des fixtures.
    expect(
      gap,
      `${f.name} — TWR ${twr.toFixed(2)} % vs Croissance ${croissance.toFixed(2)} % `
      + `→ écart ${gap.toFixed(2)} pp. Le TWR mesure la performance pure des `
      + `positions (apports neutralisés). La Croissance inclut les apports `
      + `d'épargne. L'écart prouve la valeur pédagogique de la séparation.`,
    ).toBeGreaterThan(MIN_PP_GAP)
  })

  it('Diversifié : TWR (+9,5 %) > Croissance (+6,7 %) — performance pure supérieure à l\'accumulation', () => {
    // Cas pédagogique « inversé » : le marché a fait mieux que la moyenne
    // pondérée par les apports — preuve que l'utilisateur a bien timé ses
    // entrées (rachat à 200 € après un krach).
    const f = ALL_FIXTURES.find((x) => x.id === 'patrimoine-diversifie')!
    const data = computeDashboardData(f.inputs)
    expect(data.kpis.twr_portefeuille_pct!).toBeGreaterThan(data.kpis.croissance_patrimoine_pct!)
  })

  it('Préretraité : TWR (+4,5 %) > Croissance (+2,1 %) — fonds euros sur-performant la moyenne patrimoniale', () => {
    // Profil stable mais croissance patrimoine plombée par le poids des
    // assets non-portefeuille (immo dont la valeur est statique sur la
    // période). Le TWR du fonds euros reste +4,5 % réels.
    const f = ALL_FIXTURES.find((x) => x.id === 'preretraite')!
    const data = computeDashboardData(f.inputs)
    expect(data.kpis.twr_portefeuille_pct!).toBeGreaterThan(data.kpis.croissance_patrimoine_pct!)
  })
})
