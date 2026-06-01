/**
 * Spec P0.7 — Meilleur / Pire investissement PAR CLASSE d'actifs.
 *
 * Cible : afficher un meilleur ET un pire par classe (financier, immobilier,
 * cash), AVEC libellé explicite de la métrique :
 *   - Financier : TWR annualisé (par enveloppe ou position)
 *   - Immobilier : rendement net annualisé = (loyers nets − charges − intérêts) / equity investi
 *   - Cash : rendement nominal (livrets) = taux servi
 *
 * Convention de comparabilité retenue (Annexe C du rapport) :
 *   - PAS de podium inter-classes par défaut (sinon levier immo écrase tout)
 *   - Toggle expert disponible pour comparer en TRI net de levier
 */
import { describe, it } from 'vitest'

describe('P0.7 — Meilleur / Pire par classe', () => {
  it.todo('financier : podium TWR par enveloppe ou position (ETF World, Tesla, etc.)')
  it.todo('immobilier : podium rendement net annualisé par bien')
  it.todo('cash : podium taux servi par livret/compte')
  it.todo('PAS de podium inter-classes par défaut — chaque classe a son propre top/flop')
  it.todo('toggle « comparer toutes classes » : utilise TRI net de levier pour comparer immo et financier')
  it.todo('label de métrique exposé : « TWR annualisé » / « Rendement net immobilier » / « Taux servi »')
  it.todo('tooltip « Comment c\'est calculé ? » par carte')
})
