/**
 * Spec P0.2 (edge case) — Patrimoine net négatif (dettes > actifs).
 *
 * Cible : afficher la valeur négative SANS masquage, avec une sémantique
 * claire (badge danger + texte explicatif « endettement supérieur aux actifs »).
 *
 * Bascule automatique : si net ≤ 0, le donut d'allocation bascule sur le
 * BRUT (sinon les % seraient incalculables ou trompeurs).
 */
import { describe, it } from 'vitest'

describe('P0.2 — Edge case patrimoine net négatif', () => {
  it.todo('actifs 10 k€, dette 50 k€ → netValue = −40 000 € (pas masqué)')
  it.todo('flag `endettementExcessif=true` exposé pour l\'UI')
  it.todo('donut d\'allocation : si net ≤ 0, bascule auto sur brut + tooltip explicatif')
  it.todo('TWR portefeuille reste calculable indépendamment du signe du net')
  it.todo('CAGR croissance patrimoine : ne plante pas si oldest.total_net_value < 0 (retourne null + raison)')
})
