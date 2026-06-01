/**
 * Spec P0.1/P0.2 — Patrimoine net = brut MV strict − CRD total.
 *
 * Cible :
 *   netValue = grossValueMVStrict − (totalCapitalRemaining + debtsNonImmo)
 *
 * Doit converger centime-près entre :
 *   - le pipeline unique `getPatrimoineComplet` (après P0.1)
 *   - les valeurs `expected.netValue` des 6 fixtures
 */
import { describe, it } from 'vitest'

describe('P0.1/P0.2 — Patrimoine net (depuis brut MV strict)', () => {
  it.todo('debutant : netValue = 15 000 €')
  it.todo('investisseur-immo : netValue = 376 000 €')
  it.todo('investisseur-boursier : netValue = 157 000 €')
  it.todo('patrimoine-diversifie : netValue = 800 000 €')
  it.todo('preretraite : netValue = 1 500 000 €')
  it.todo('hnw-complexe : netValue = 3 100 000 €')
  it.todo('CRD analytique immo ≠ capital_remaining stocké : on consomme le calcul de portfolio.totalCapitalRemaining (source unique)')
  it.todo('debts non-immo : on filtre par simAssetIds pour éviter le double comptage avec le portfolio immo')
})
