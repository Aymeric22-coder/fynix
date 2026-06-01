/**
 * Spec P0.5 — Top 5 consolidé par enveloppe / bien.
 *
 * Cible : 1 ligne = 1 enveloppe (PEA, CTO, AV, PER), 1 ligne = 1 bien immo,
 * 1 ligne = 1 livret. PAS de positions atomiques mélangées.
 *
 * Drill-down au clic = expand vers le détail atomique (rendu UI, hors test).
 *
 * Fallback (cf. Phase 5.5 dépendance cachée) : si `envelope_id IS NULL` sur
 * ≥ 50 % des positions, agréger par `asset_class` au lieu de par enveloppe.
 */
import { describe, it } from 'vitest'

describe('P0.5 — Top consolidé par enveloppe / bien', () => {
  it.todo('investisseur-boursier : top = [PEA 80k, CTO 37k, AV 30k, Livret 10k] — pas de positions atomiques')
  it.todo('investisseur-immo : top = [RP 350k, L1 200k, L2 180k, L3 160k, AV 50k]')
  it.todo('patrimoine-diversifie : top mix RE + PEA + AV cohérent avec expected.topConsolidatedAfterRefactor')
  it.todo('hnw-complexe : SCI (proxy other) en tête, puis holding, puis biens immo, puis CTO total')
  it.todo('fallback : si <50 % positions avec envelope_id → agrégation par asset_class')
  it.todo('un livret = 1 ligne (même si plusieurs livrets différents : Livret A + LDDS regroupés)')
  // À débattre : regrouper « Livret A + LDDS » ou les laisser séparés ?
  // Décision provisoire : séparés (cohérent avec l\'UX produit Cash actuelle).
  it.todo('drill-down : expandTop(envelopeId) retourne les positions atomiques de l\'enveloppe')
})
