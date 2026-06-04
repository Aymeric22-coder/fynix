/**
 * V1.3 Volet A — Tests dédiés du bloc « coussin de sécurité » de
 * `calculerSolidite`, désormais paramétré par `statut_pro` /
 * `stabilite_revenus` via `computeMatelasCible` (single source of truth
 * avec /cash).
 *
 * Sémantique : Solidité = résilience absolue → cash BRUT (l'utilisateur
 * peut casser ses intentions volontaires en urgence).
 *
 * Échelle existante préservée : <seuilBas −20, [seuilBas;seuilHaut[ +5,
 * ≥seuilHaut +20. Seuls les seuils sont paramétrés.
 */
import { describe, it, expect } from 'vitest'
import { calculerSolidite } from '../scores'
import type { PatrimoineComplet } from '@/types/analyse'

/**
 * Fixture base : charges 2 000 €, pas d'immo, totalCash variable.
 * Seuls les facteurs (b) loyers, (c) coussin et (d) krach impactent le
 * score ; (a) effort à 0 (pas de mensualités). Stabilité optionnelle.
 */
function patrimoine(
  totalCash: number,
  statutPro: string | null,
  stabilite: string | null = null,
): PatrimoineComplet {
  return {
    totalBrut:              totalCash,
    totalNet:               totalCash,
    totalPortefeuille:      0,
    totalImmo:              0,
    totalCash,
    totalCashInvestissable: 0,
    cashEffectif:           totalCash,
    totalIntentsActives:    0,
    totalDettes:            0,
    totalImmoEquity:        0,
    risqueImmoGlobal:       0,
    revenuPassifImmo:       0,
    mensualitesImmoTotal:   0,
    rendementNetImmoMoyen:  0,
    // Aucune position cash ici : `totalCash` couvre déjà l'aspect liquidité,
    // et `AnalyseAssetType` n'inclut pas 'cash' (le cash vit dans `comptes`).
    positions: [],
    biens: [], comptes: [],
    repartitionClasses:     [],
    repartitionSectorielle: [],
    repartitionGeo:         [],
    scoreDiversificationSectorielle: 50,
    scoreDiversificationGeo:         50,
    rendementEstime:        2,
    revenuPassifActuel:     0,
    projectionFIRESnapshot: null,
    lifeEvents:             [],
    profilType:             null,
    prenom:                 'Test',
    fireInputs: {
      age:                  35,
      age_cible:            55,
      epargne_mensuelle:    500,
      revenu_passif_cible:        2_000,
      revenu_passif_cible_ajuste: 2_000,
      cibleFoyerDetail: {
        brut: 2_000, ajuste: 2_000, enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint:      0,
      situation_familiale:  'Célibataire',
      enfants:              '0',
      revenu_mensuel_total: 4_000,
      charges_mensuelles:   2_000,
      risk_score:           50,
      enveloppes:           [],
      tmi_rate:             30,
      tmi_estime:           false,
      actions_eu_value:     0,
      stabilite_revenus:    stabilite,
      statut_pro:           statutPro,
    } as never,
    scores:           {} as never,
    recommandations:  [],
    analyseFiabilite: { pct: 100, niveau: 'vert', label: 'OK' },
    unmappedEtfs:     [],
    unmappedAll:      [],
    cryptoTotal:      0,
    cryptoCostTotal:  0,
    cryptoBreakdown:  [],
    lastUpdated:      new Date().toISOString(),
  }
}

// Helper d'extraction : on lit la part « moisCouverts » du détail texte.
function extractMoisCouverts(p: PatrimoineComplet): string {
  return calculerSolidite(p).details ?? ''
}

// ──────────────────────────────────────────────────────────────────────
// Personas du brief V1.3 Volet A
// ──────────────────────────────────────────────────────────────────────
describe('V1.3 Volet A — coussin paramétré par statut_pro', () => {
  it('CDI stable + 6 mois de charges → coussin OK (≥ seuilHaut = 6)', () => {
    const p = patrimoine(12_000, 'Salarié') // 12 000 / 2 000 = 6 mois
    const s = calculerSolidite(p)
    // « 6 mois (très bien) » dans le détail.
    expect(extractMoisCouverts(p)).toMatch(/6 mois \(très bien\)/i)
    // Pour CDI : multiplier 3/6 → 6 mois ≥ 6 → coussin +20.
    expect(s.value).toBeGreaterThanOrEqual(60)
  })

  it('CDI stable + 3 mois de charges → coussin correct (seuilBas)', () => {
    const p = patrimoine(6_000, 'Salarié') // 6 000 / 2 000 = 3 mois
    expect(extractMoisCouverts(p)).toMatch(/3\.0 mois \(correct\)/i)
  })

  it('Indépendant + 6 mois de charges → coussin CORRECT, plus « très bien » (régression V1.3)', () => {
    // Multiplier indépendant = 6-12. 6 mois est sur le seuil bas, < seuilHaut → +5 pts.
    const p = patrimoine(12_000, 'Indépendant / Freelance')
    expect(extractMoisCouverts(p)).toMatch(/6\.0 mois \(correct\)/i)
  })

  it('Indépendant + 12 mois de charges → coussin très bien (≥ seuilHaut = 12)', () => {
    const p = patrimoine(24_000, 'Indépendant / Freelance')
    expect(extractMoisCouverts(p)).toMatch(/12 mois \(très bien\)/i)
  })

  it('Indépendant + 5 mois de charges → coussin FRAGILE (< seuilBas = 6)', () => {
    const p = patrimoine(10_000, 'Indépendant / Freelance')
    expect(extractMoisCouverts(p)).toMatch(/5\.0 mois \(fragile\)/i)
  })

  it('Statut absent + 6 mois → fallback 3/6 → très bien préservé', () => {
    // Fallback préserve le comportement V1.0–V1.2 pour les profils incomplets.
    const p = patrimoine(12_000, null)
    expect(extractMoisCouverts(p)).toMatch(/6 mois \(très bien\)/i)
  })

  it('Stabilité « instable » forcée + 9 mois → coussin CORRECT (override min=9)', () => {
    // override instable = 9/12. moisCouverts = 9 est sur le seuil bas
    // → entre 9 et 12 → +5 pts (correct).
    const p = patrimoine(18_000, 'Salarié', 'Très variables')
    expect(extractMoisCouverts(p)).toMatch(/9\.0 mois \(correct\)/i)
  })

  it('Aymeric P5 (indépendant + stab instable + 11,1 mois) : coussin CORRECT, plus très bien', () => {
    // Cas réel : charges 1 675 €, cash brut 18 578 €, statut indépendant,
    // stabilité instable → override 9/12. moisCouverts = 18578/1675 ≈ 11,09.
    // 11 ∈ [9 ; 12[ → +5 pts (avant V1.3 : +20).
    const p = patrimoine(18_578, 'Indépendant / Freelance', 'Très variables')
    // Charges 1675 dans fireInputs.charges_mensuelles
    p.fireInputs.charges_mensuelles = 1_675
    expect(extractMoisCouverts(p)).toMatch(/11\.1 mois \(correct\)/i)
  })

  it('cash effectif non utilisé : Solidité reste sur cash BRUT même avec intents', () => {
    // V1.3 spec : Solidité = résilience absolue → cash brut.
    // Intents ne doivent PAS amputer la mesure (l'utilisateur peut casser
    // ses intentions en urgence).
    const p = patrimoine(20_000, 'Salarié')
    p.cashEffectif        = 5_000  // intents énormes
    p.totalIntentsActives = 15_000
    // Mesure brut : 20 000 / 2 000 = 10 mois → très bien.
    expect(extractMoisCouverts(p)).toMatch(/10 mois \(très bien\)/i)
  })

  // ────────────────────────────────────────────────────────────────────
  // V1.3-PATCH — Harmonisation : `moisCouverts` désormais calculé sur
  // `charges_mensuelles` SEULES (sans effort immo). Cohérent avec
  // /cash bloc Matelas + composant CouvertureCash /analyse.
  // ────────────────────────────────────────────────────────────────────
  it('V1.3-PATCH : effort immo 1 500 € + charges 1 500 € + cash 9 000 € → 6 mois (sur charges seules)', () => {
    // Avant V1.3-PATCH : moisCouverts = 9 000 / (1 500 + 1 500) = 3 → fragile.
    // Après V1.3-PATCH : moisCouverts = 9 000 / 1 500 = 6 → très bien (CDI seuilHaut = 6).
    const p = patrimoine(9_000, 'Salarié')
    p.fireInputs.charges_mensuelles = 1_500
    // On simule un cash-flow immo négatif de 1 500 €/mois.
    p.revenuPassifImmo = -1_500
    expect(extractMoisCouverts(p)).toMatch(/6 mois \(très bien\)/i)
  })

  it('V1.3-PATCH : utilisateur sans effort immo → comportement strictement inchangé vs V1.3', () => {
    // Sans immo (revenuPassifImmo = 0), le numérateur est identique
    // à V1.3 (charges seules dans les 2 cas).
    const p = patrimoine(12_000, 'Salarié')
    expect(extractMoisCouverts(p)).toMatch(/6 mois \(très bien\)/i)
  })
})
