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
describe('V1.3 Volet A — coussin paramétré par statut_pro (wording V1.4 contextualisé)', () => {
  // V1.4 Vol A : wording paramétré par statut. Pour CDI cible 3/6, 6 mois
  // est PILE sur la cible haute → « dans la cible » au lieu du « très bien »
  // historique V1.3.
  it('CDI stable + 6 mois de charges → coussin DANS LA CIBLE (6 ≤ seuilHaut)', () => {
    const p = patrimoine(12_000, 'Salarié') // 12 000 / 2 000 = 6 mois
    const s = calculerSolidite(p)
    expect(extractMoisCouverts(p)).toMatch(/6\.0 mois \(dans la cible\)/i)
    // Échelle de points inchangée : +5 pour dans la cible. Score >= 60 préservé.
    expect(s.value).toBeGreaterThanOrEqual(55)
  })

  it('CDI stable + 3 mois → DANS LA CIBLE (3 = seuilBas, V1.4 inclusif)', () => {
    const p = patrimoine(6_000, 'Salarié') // 6 000 / 2 000 = 3 mois
    expect(extractMoisCouverts(p)).toMatch(/3\.0 mois \(dans la cible\)/i)
  })

  it('Indépendant + 6 mois → DANS LA CIBLE (6 = seuilBas indépendant)', () => {
    const p = patrimoine(12_000, 'Indépendant / Freelance')
    expect(extractMoisCouverts(p)).toMatch(/6\.0 mois \(dans la cible\)/i)
  })

  it('Indépendant + 12 mois → DANS LA CIBLE (12 = seuilHaut indépendant)', () => {
    const p = patrimoine(24_000, 'Indépendant / Freelance')
    expect(extractMoisCouverts(p)).toMatch(/12\.0 mois \(dans la cible\)/i)
  })

  it('Indépendant + 5 mois → INSUFFISANT (< seuilBas = 6)', () => {
    const p = patrimoine(10_000, 'Indépendant / Freelance')
    expect(extractMoisCouverts(p)).toMatch(/5\.0 mois \(insuffisant\)/i)
  })

  it('Statut absent + 6 mois → fallback 3/6, wording historique « excellent »', () => {
    // Fallback profil incomplet : wording 3 paliers V1.3 préservé.
    const p = patrimoine(12_000, null)
    expect(extractMoisCouverts(p)).toMatch(/6 mois \(excellent\)/i)
  })

  it('Override instable + 9 mois → DANS LA CIBLE (override 9/12)', () => {
    const p = patrimoine(18_000, 'Salarié', 'Très variables')
    expect(extractMoisCouverts(p)).toMatch(/9\.0 mois \(dans la cible\)/i)
  })

  it('Aymeric P5 (indépendant + stab instable + 11,1 mois) : DANS LA CIBLE (V1.4 wording)', () => {
    // Cas réel : moisCouverts ≈ 11,09 ∈ [9 ; 12] → « dans la cible »
    // (avant V1.4 : « correct ») — ferme la dissonance signalée en prod.
    const p = patrimoine(18_578, 'Indépendant / Freelance', 'Très variables')
    p.fireInputs.charges_mensuelles = 1_675
    expect(extractMoisCouverts(p)).toMatch(/11\.1 mois \(dans la cible\)/i)
  })

  it('cash effectif non utilisé : Solidité reste sur cash BRUT même avec intents', () => {
    // CDI cible 3/6, cap haut = 9. 10 mois > 9 → « bien au-delà de la cible ».
    const p = patrimoine(20_000, 'Salarié')
    p.cashEffectif        = 5_000
    p.totalIntentsActives = 15_000
    expect(extractMoisCouverts(p)).toMatch(/10 mois \(bien au-delà de la cible\)/i)
  })

  // ────────────────────────────────────────────────────────────────────
  // V1.3-PATCH — Harmonisation : `moisCouverts` désormais calculé sur
  // `charges_mensuelles` SEULES (sans effort immo). Cohérent avec
  // /cash bloc Matelas + composant CouvertureCash /analyse.
  // ────────────────────────────────────────────────────────────────────
  it('V1.3-PATCH : effort immo 1 500 € + charges 1 500 € + cash 9 000 € → 6 mois sur charges seules (V1.4 « dans la cible »)', () => {
    // Avant V1.3-PATCH : moisCouverts = 9 000 / (1 500 + 1 500) = 3 → fragile.
    // Après V1.3-PATCH : moisCouverts = 9 000 / 1 500 = 6 → V1.4 wording :
    // « 6.0 mois (dans la cible) » pour CDI cible 3/6 (6 ≤ seuilHaut).
    const p = patrimoine(9_000, 'Salarié')
    p.fireInputs.charges_mensuelles = 1_500
    // On simule un cash-flow immo négatif de 1 500 €/mois.
    p.revenuPassifImmo = -1_500
    expect(extractMoisCouverts(p)).toMatch(/6\.0 mois \(dans la cible\)/i)
  })

  it('V1.3-PATCH : utilisateur sans effort immo → comportement strictement inchangé vs V1.3 (V1.4 « dans la cible »)', () => {
    // Sans immo (revenuPassifImmo = 0), le numérateur est identique
    // à V1.3 (charges seules dans les 2 cas). V1.4 : « dans la cible ».
    const p = patrimoine(12_000, 'Salarié')
    expect(extractMoisCouverts(p)).toMatch(/6\.0 mois \(dans la cible\)/i)
  })

  // ────────────────────────────────────────────────────────────────────
  // V1.4 Volet A — Nouveaux paliers « au-delà » et « bien au-delà »
  // ────────────────────────────────────────────────────────────────────
  it('V1.4 : indépendant-instable + 13 mois → AU-DELÀ (13 ∈ ]12 ; 18])', () => {
    // Indépendant + stab instable → override 9/12, cap haut = 12 × 1,5 = 18.
    const p = patrimoine(13 * 2_000, 'Indépendant / Freelance', 'Très variables')
    expect(extractMoisCouverts(p)).toMatch(/13\.0 mois \(au-delà de la cible\)/i)
  })

  it('V1.4 : indépendant-instable + 20 mois → BIEN AU-DELÀ (20 > 18 = cap)', () => {
    const p = patrimoine(20 * 2_000, 'Indépendant / Freelance', 'Très variables')
    expect(extractMoisCouverts(p)).toMatch(/20 mois \(bien au-delà de la cible\)/i)
  })

  it('V1.4 : CDI + 8 mois → AU-DELÀ (8 ∈ ]6 ; 9])', () => {
    // CDI cible 3/6, cap haut = 9.
    const p = patrimoine(8 * 2_000, 'Salarié')
    expect(extractMoisCouverts(p)).toMatch(/8\.0 mois \(au-delà de la cible\)/i)
  })

  it('V1.4 : CDI + 12 mois → BIEN AU-DELÀ (12 > 9 = cap)', () => {
    const p = patrimoine(12 * 2_000, 'Salarié')
    expect(extractMoisCouverts(p)).toMatch(/12 mois \(bien au-delà de la cible\)/i)
  })

  it('V1.4 : profil incomplet + 8 mois → fallback « excellent » (wording V1.3 préservé)', () => {
    const p = patrimoine(8 * 2_000, null)
    expect(extractMoisCouverts(p)).toMatch(/8 mois \(excellent\)/i)
  })

  it('V1.4 : CDI + 2 mois → INSUFFISANT', () => {
    const p = patrimoine(2 * 2_000, 'Salarié')
    expect(extractMoisCouverts(p)).toMatch(/2\.0 mois \(insuffisant\)/i)
  })
})
