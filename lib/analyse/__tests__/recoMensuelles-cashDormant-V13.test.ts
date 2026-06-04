/**
 * V1.3 Volet B — Tests dédiés du detecteur `detectCashDormant` de
 * `recoMensuelles.ts` après paramétrage du `coussinCible` par statut.
 *
 * Sémantique recos = excédent réellement investissable → cash EFFECTIF.
 * Cible coussin = `computeMatelasCible(profile).cibleHauteEur`, fallback
 * charges×6 si profil incomplet.
 */
import { describe, it, expect } from 'vitest'
import { genererActionsMensuelles } from '../recoMensuelles'
import type { PatrimoineComplet, EnrichedPosition, AnalyseAssetType } from '@/types/analyse'

function pos(over: Partial<EnrichedPosition> = {}): EnrichedPosition {
  return {
    isin: 'X', name: 'X', quantity: 1, pru: 100,
    current_price: 100, current_value: 100, current_value_local: 100,
    gain_loss: 0, gain_loss_pct: 0,
    asset_type: 'stock' as AnalyseAssetType, sector: null, country: null,
    currency: 'EUR', price_estimated: false, weight_in_portfolio: 0,
    ...over,
  }
}

function patrimoine(opts: {
  totalCash:           number
  cashEffectif?:       number
  charges?:            number
  statutPro:           string | null
  stabilite?:          string | null
}): PatrimoineComplet {
  const charges = opts.charges ?? 2_000
  return {
    totalBrut:              opts.totalCash + 10_000,
    totalNet:               opts.totalCash + 10_000,
    totalPortefeuille:      10_000,
    totalImmo:              0,
    totalCash:              opts.totalCash,
    totalCashInvestissable: opts.totalCash,
    cashEffectif:           opts.cashEffectif ?? opts.totalCash,
    totalIntentsActives:    Math.max(0, opts.totalCash - (opts.cashEffectif ?? opts.totalCash)),
    totalDettes:            0,
    totalImmoEquity:        0,
    risqueImmoGlobal:       0,
    revenuPassifImmo:       0,
    mensualitesImmoTotal:   0,
    rendementNetImmoMoyen:  0,
    positions: [pos({ asset_type: 'etf', current_value: 10_000 })],
    biens: [], comptes: [],
    repartitionClasses: [
      { label: 'ETF / Fonds', valeur: 10_000, pourcentage: 50, color: '#10B981' },
      { label: 'Cash', valeur: opts.totalCash, pourcentage: 50, color: '#71717a' },
    ],
    repartitionSectorielle: [],
    repartitionGeo:         [],
    scoreDiversificationSectorielle: 50,
    scoreDiversificationGeo:         50,
    rendementEstime:        5,
    revenuPassifActuel:     0,
    projectionFIRESnapshot: null,
    lifeEvents:             [],
    profilType:             null,
    prenom:                 'Test',
    fireInputs: {
      age: 35, age_cible: 55,
      epargne_mensuelle: 800,
      revenu_passif_cible:        2_000,
      revenu_passif_cible_ajuste: 2_000,
      cibleFoyerDetail: {
        brut: 2_000, ajuste: 2_000, enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint: 0,
      situation_familiale: 'Célibataire',
      enfants: '0',
      revenu_mensuel_total: 4_000,
      charges_mensuelles:   charges,
      risk_score: 50,
      enveloppes: [],
      tmi_rate: 30,
      tmi_estime: false,
      actions_eu_value: 0,
      stabilite_revenus: opts.stabilite ?? null,
      statut_pro:        opts.statutPro,
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

function findCashDormant(p: PatrimoineComplet) {
  // V1.3 — On utilise `cashSeuilMois: 6` (au lieu du défaut 12) pour que
  // la règle se déclenche dans nos cas de test à 10 mois de couverture.
  // Le seuil 12 mois est conservé en prod (cf. CASH_SEUIL_MOIS) pour
  // limiter le bruit recos sur les profils riches en cash transitoire.
  const actions = genererActionsMensuelles(p, { cashSeuilMois: 6 })
  return actions.find((a) => a.id === 'invest-cash-dormant')
}

// ──────────────────────────────────────────────────────────────────────
// V1.3 — cas du brief
// ──────────────────────────────────────────────────────────────────────
// Le détecteur peut renvoyer 2 formats selon le plafond mensuel :
//   - mode "monthlyPlan" : titre « Réinvestir ~X €/mois pendant N mois »
//     + description qui contient le total aInvestir (« déployer Y € »).
//   - mode "lumpSum"     : titre « X € de cash dormant à mettre au travail ».
// Pour assertions stables, on vérifie la description ET on confirme le
// montant via parsing du nombre attendu.
function getTotalAInvestir(action: { titre: string; description: string }): string {
  // Cherche « déployer X € » dans la description (mode monthlyPlan) sinon
  // le titre (mode lumpSum).
  const m = action.description.match(/d[ée]ployer\s+([\d\s  ]+)\s*€/i)
                ?? action.titre.match(/^([\d\s  ]+)\s*€/i)
  return (m?.[1] ?? '').replace(/[\s  ]/g, '')
}

describe('detectCashDormant — V1.3 paramétrage par statut', () => {
  it('CDI sans intents, cash 20k, charges 2k → coussin 12k, aInvestir 8k', () => {
    const p = patrimoine({ totalCash: 20_000, charges: 2_000, statutPro: 'Salarié' })
    const action = findCashDormant(p)
    expect(action).toBeDefined()
    expect(getTotalAInvestir(action!)).toBe('8000')
  })

  it('Indépendant sans intents, cash 20k, charges 2k → coussin 24k, aInvestir 0 (action SUPPRIMÉE)', () => {
    // V1.3 régression sémantique attendue : multiplier indépendant = 6-12 →
    // cibleHaute = 2 000 × 12 = 24 000 > totalCash 20 000 → rien à investir.
    const p = patrimoine({ totalCash: 20_000, charges: 2_000, statutPro: 'Indépendant / Freelance' })
    const action = findCashDormant(p)
    expect(action).toBeUndefined()
  })

  it('CDI + intent 5k, cash brut 20k, charges 2k → cashEffectif 15k, aInvestir 3k', () => {
    // cibleHaute CDI = 12 000. cashEffectif 15 000 → 15 000 − 12 000 = 3 000.
    const p = patrimoine({
      totalCash:    20_000,
      cashEffectif: 15_000,
      charges:      2_000,
      statutPro:    'Salarié',
    })
    const action = findCashDormant(p)
    expect(action).toBeDefined()
    expect(getTotalAInvestir(action!)).toBe('3000')
  })

  it('Profil incomplet (statutPro null) → fallback charges×6 → cible 12k', () => {
    const p = patrimoine({ totalCash: 20_000, charges: 2_000, statutPro: null })
    const action = findCashDormant(p)
    expect(action).toBeDefined()
    // 20 000 − 12 000 = 8 000 € → fallback historique préservé.
    expect(getTotalAInvestir(action!)).toBe('8000')
  })

  it('Aymeric V1.3 (indépendant + instable + cash 18 578 € + charges 1 675 €) → action SUPPRIMÉE', () => {
    // override instable → cibleHaute = 1 675 × 12 = 20 100 > 18 578 → rien
    // à investir (avant V1.3 : aInvestir = 18 578 − 6×1 675 = 8 528 € → action
    // affichée). Régression sémantique correcte : un indépendant volatil ne
    // doit pas se voir reprocher 18 mois de charges en cash.
    const p = patrimoine({
      totalCash: 18_578,
      charges:   1_675,
      statutPro: 'Indépendant / Freelance',
      stabilite: 'Très variables',
    })
    const action = findCashDormant(p)
    expect(action).toBeUndefined()
  })

  it('Cash effectif amputé par intents → reco basée sur l\'effectif, pas le brut', () => {
    // CDI cash brut 30 000, intent 15 000 (apport immo) → effectif 15 000.
    // cibleHaute 12 000. aInvestir = 15 000 − 12 000 = 3 000 €.
    const p = patrimoine({
      totalCash:    30_000,
      cashEffectif: 15_000,
      charges:      2_000,
      statutPro:    'Salarié',
    })
    const action = findCashDormant(p)
    expect(action).toBeDefined()
    expect(getTotalAInvestir(action!)).toBe('3000')
  })
})
