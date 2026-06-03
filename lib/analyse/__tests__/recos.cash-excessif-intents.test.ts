/**
 * V1.2 Volet D — Neutralisation alerte `cash-excessif` par les intents.
 *
 * Vérifie :
 *   - Cas P5 audit § 7 : 49 000 € de cash + intent 35 000 € → l'alerte
 *     `cash-excessif` n'est PLUS déclenchée (cashEffectif = 14 000 €,
 *     partCash = 28 % vs > 20 %). Sans intent → alerte présente comme
 *     en V1.1.
 *   - Fallback préservé : si `cashEffectif` n'est PAS exposé sur le
 *     `PatrimoineComplet` (fixtures pre-V1.2), le comportement
 *     V1.1 (`totalCash`) reste actif → 0 régression.
 */
import { describe, it, expect } from 'vitest'
import { genererRecommandations } from '../recommandations'
import type { PatrimoineComplet, Score } from '@/types/analyse'

const SCORE_OK: Score = { value: 80, niveau: 'vert', label: 'OK', details: '' } as Score

const DUMMY_SCORES = {
  solidite:          SCORE_OK,
  diversification:   SCORE_OK,
  fiscale:           SCORE_OK,
  croissance:        SCORE_OK,
  coherence_profil:  SCORE_OK,
  global:            80,
} as never

function makePatrimoine(over: Partial<PatrimoineComplet>): PatrimoineComplet {
  return {
    totalBrut:              60_000,
    totalNet:               60_000,
    totalPortefeuille:      11_000,
    totalImmo:              0,
    totalCash:              49_000,
    totalCashInvestissable: 49_000,
    cashEffectif:           49_000,
    totalIntentsActives:    0,
    totalDettes:            0,
    totalImmoEquity:        0,
    risqueImmoGlobal:       0,
    revenuPassifImmo:       0,
    mensualitesImmoTotal:   0,
    rendementNetImmoMoyen:  0,
    positions: [],
    biens:     [],
    comptes:   [],
    repartitionClasses:     [],
    repartitionSectorielle: [],
    repartitionGeo:         [],
    scoreDiversificationSectorielle: 0,
    scoreDiversificationGeo:         0,
    rendementEstime:        3,
    revenuPassifActuel:     0,
    projectionFIRESnapshot: null,
    profilType:             null,
    prenom:                 'Test',
    fireInputs: {
      age:                        35,
      age_cible:                  50,
      epargne_mensuelle:          0,
      revenu_passif_cible:        2000,
      revenu_passif_cible_ajuste: 2000,
      cibleFoyerDetail:           { base: 2000, deltaConjoint: 0, deltaEnfants: 0, total: 2000 } as never,
      revenu_conjoint:            0,
      revenu_mensuel_total:       3000,
      charges_mensuelles:         2000,
      risk_score:                 50,
      enveloppes:                 [],
      tmi_rate:                   30,
      tmi_estime:                 false,
      actions_eu_value:           0,
    } as never,
    lifeEvents:        [],
    scores:            {} as never,
    recommandations:   [],
    analyseFiabilite:  { pct: 0, label: '' } as never,
    unmappedEtfs:      [],
    unmappedAll:       [],
    cryptoTotal:       0,
    cryptoCostTotal:   0,
    cryptoBreakdown:   [],
    lastUpdated:       new Date().toISOString(),
    ...over,
  }
}

describe('cash-excessif — neutralisation par cashEffectif (V1.2 Volet D)', () => {
  it('P5 SANS intents : cash 49 k€ sur brut 60 k€ → alerte déclenchée', () => {
    const p = makePatrimoine({
      totalCash:           49_000,
      cashEffectif:        49_000, // pas d'intents
      totalIntentsActives: 0,
    })
    const recos = genererRecommandations(p, DUMMY_SCORES)
    const found = recos.find((r) => r.id === 'cash-excessif')
    expect(found).toBeDefined()
    expect(found?.description).toMatch(/49000|49 000/)
  })

  it('P5 AVEC intent 35 k€ : cashEffectif 14 k€ → partCash 23 % > 20 → alerte conserve mais sur effectif', () => {
    // Note : 14 000 / 60 000 = 23,3 % donc > 20 % → alerte déclenchée mais
    // sur la valeur EFFECTIVE, pas la brute. La description doit refléter
    // ces 14 000 € (pas 49 000 €).
    const p = makePatrimoine({
      totalCash:           49_000,
      cashEffectif:        14_000,
      totalIntentsActives: 35_000,
    })
    const recos = genererRecommandations(p, DUMMY_SCORES)
    const found = recos.find((r) => r.id === 'cash-excessif')
    expect(found).toBeDefined()
    expect(found?.description).toMatch(/14000|14 000/)
  })

  it('P5 AVEC intent 40 k€ : cashEffectif 9 k€ → partCash 15 % → alerte NEUTRALISÉE', () => {
    // Cas typique apport immo qui ramène le partCash sous 20 %.
    const p = makePatrimoine({
      totalCash:           49_000,
      cashEffectif:        9_000,
      totalIntentsActives: 40_000,
    })
    const recos = genererRecommandations(p, DUMMY_SCORES)
    const found = recos.find((r) => r.id === 'cash-excessif')
    expect(found).toBeUndefined()
  })

  it('fallback rétro-compat : fixture sans cashEffectif → consomme totalCash', () => {
    // Simule une fixture pre-V1.2 qui n'expose pas `cashEffectif`.
    const p = makePatrimoine({ totalCash: 49_000 })
    delete (p as Partial<PatrimoineComplet>).cashEffectif
    const recos = genererRecommandations(p, DUMMY_SCORES)
    const found = recos.find((r) => r.id === 'cash-excessif')
    expect(found).toBeDefined()
    expect(found?.description).toMatch(/49000|49 000/)
  })
})
