/**
 * Fixtures partagees pour les tests ARIA.
 * Construit un `PatrimoineComplet` minimal mais coherent, avec overrides.
 */

import type {
  PatrimoineComplet, EnrichedPosition, BienImmo, CompteCash,
  Score, ScoresComplets, Recommandation,
} from '@/types/analyse'

function scoreOK(value: number, label = 'Bon'): Score {
  return { value, niveau: value >= 70 ? 'vert' : value >= 50 ? 'jaune' : value >= 30 ? 'orange' : 'rouge', label }
}

export function makeScoresFixture(overrides?: Partial<ScoresComplets>): ScoresComplets {
  return {
    diversification:    scoreOK(75, 'Bien diversifie'),
    coherence_profil:   scoreOK(80, 'Alignement OK'),
    progression_fire:   scoreOK(60, 'En route'),
    solidite:           scoreOK(70, 'Solide'),
    efficience_fiscale: scoreOK(55, 'Marge d\'optimisation'),
    ...overrides,
  }
}

export function makePositionFixture(overrides?: Partial<EnrichedPosition>): EnrichedPosition {
  return {
    isin:                'US0378331005',
    name:                'Apple Inc',
    quantity:            10,
    pru:                 150,
    current_price:       190,
    current_value:       1900,
    current_value_local: 1900,
    gain_loss:           400,
    gain_loss_pct:       26.6,
    asset_type:          'stock',
    sector:              'Technology',
    country:             'United States',
    currency:            'USD',
    price_estimated:     false,
    weight_in_portfolio: 50,
    ...overrides,
  }
}

export function makeBienFixture(overrides?: Partial<BienImmo>): BienImmo {
  return {
    id:                   'bien-1',
    nom:                  'T2 Saint-Brieuc',
    ville:                'Saint-Brieuc',
    pays:                 'France',
    type:                 'Locatif',
    valeur:               150_000,
    loyer_mensuel:        650,
    credit_restant:       100_000,
    mensualite_credit:    500,
    charges_annuelles:    1_800,
    charges_are_estimated: false,
    equity:               50_000,
    rendement_brut:       5.2,
    rendement_net:        4.0,
    cashflow_mensuel:     0,
    cashflow_net_fiscal:  -50,
    impot_mensuel_estime: 50,
    taux_effort_fiscal:   10,
    ltv:                  66.6,
    niveau_levier:        'Modéré',
    risque_immo:          50,
    donnees_completes:    true,
    taux_interet_estime:  3,
    duree_restante_mois:  240,
    fiscal_regime:        'LMNP',
    ...overrides,
  }
}

export function makeCompteFixture(overrides?: Partial<CompteCash>): CompteCash {
  return {
    id:     'cash-1',
    nom:    'Livret A',
    type:   'livret_a',
    banque: 'Boursorama',
    solde:  5000,
    devise: 'EUR',
    ...overrides,
  }
}

export function makeRecommandationFixture(overrides?: Partial<Recommandation>): Recommandation {
  return {
    id:            'reco-1',
    priorite:      'moyenne',
    categorie:     'diversification',
    titre:         'Surponderation Technologie',
    description:   'Le secteur Tech represente 45 % vs 22 % MSCI',
    impact_estime: 'Reduit le risque sectoriel',
    action:        'Reequilibrer vers les autres secteurs',
    ...overrides,
  }
}

export function makePatrimoineFixture(overrides?: Partial<PatrimoineComplet>): PatrimoineComplet {
  const positions = overrides?.positions ?? [makePositionFixture()]
  const biens     = overrides?.biens ?? [makeBienFixture()]
  const comptes   = overrides?.comptes ?? [makeCompteFixture()]
  const totalPortefeuille = positions.reduce((s, p) => s + p.current_value, 0)
  const totalImmo  = biens.reduce((s, b) => s + b.valeur, 0)
  const totalCash  = comptes.reduce((s, c) => s + c.solde, 0)
  const totalDettes = biens.reduce((s, b) => s + b.credit_restant, 0)
  const totalBrut  = totalPortefeuille + totalImmo + totalCash
  const totalNet   = totalBrut - totalDettes
  const totalImmoEquity = biens.reduce((s, b) => s + b.equity, 0)

  return {
    totalBrut,
    totalNet,
    totalPortefeuille,
    totalImmo,
    totalCash,
    totalDettes,
    totalImmoEquity,
    risqueImmoGlobal:    45,
    revenuPassifImmo:    -50,
    mensualitesImmoTotal: 500,
    rendementNetImmoMoyen: 4.0,
    positions,
    biens,
    comptes,
    repartitionClasses: [
      { label: 'Actions', valeur: totalPortefeuille, pourcentage: (totalPortefeuille / totalBrut) * 100, color: '#38BDF8' },
      { label: 'Immobilier', valeur: totalImmo, pourcentage: (totalImmo / totalBrut) * 100, color: '#E8B84B' },
      { label: 'Cash', valeur: totalCash, pourcentage: (totalCash / totalBrut) * 100, color: '#71717a' },
    ],
    repartitionSectorielle: [
      { secteur: 'Technologie', valeur: 1000, pourcentage: 50, benchmark: 22, deviation: 28, status: 'overweight_strong', positions: ['AAPL'], alerte: true },
      { secteur: 'Sante',       valeur: 500,  pourcentage: 25, benchmark: 12, deviation: 13, status: 'overweight', positions: ['UNH'], alerte: true },
    ],
    repartitionGeo: [
      { zone: 'Amerique du Nord', valeur: 1500, pourcentage: 80, benchmark: 60, deviation: 20, status: 'overweight', pays: ['United States'], alerte: true },
    ],
    scoreDiversificationSectorielle: 65,
    scoreDiversificationGeo:         70,
    rendementEstime:    5.0,
    revenuPassifActuel: 200,
    projectionFIRESnapshot: {
      age_fire_projete:           50,
      age_fire_optimiste:         47,
      age_fire_median:            50,
      age_fire_pessimiste:        55,
      rendement_central_pct:      6,
      patrimoine_age_cible:       800_000,
      patrimoine_fire_cible:      900_000,
      epargne_mensuelle_necessaire: 1200,
    },
    lifeEvents:              [],
    profilType: 'Equilibre',
    prenom:     'Aymeric',
    fireInputs: {
      age:                       35,
      age_cible:                 50,
      epargne_mensuelle:         1000,
      revenu_passif_cible:       3000,
      revenu_passif_cible_ajuste: 3000,   // QW9 — pas d'ajustement famille dans cette fixture
      cibleFoyerDetail: {
        brut: 3000, ajuste: 3000, enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint:           0,
      situation_familiale:       'Célibataire',
      enfants:                   '0',
      charges_mensuelles:        2000,
      revenu_mensuel_total:      4500,
      risk_score:                60,
      enveloppes:                ['PEA', 'AV'],
      tmi_rate:                  0.30,
      tmi_estime:                false,
      actions_eu_value:          500,
    },
    scores: makeScoresFixture(),
    recommandations: [makeRecommandationFixture()],
    analyseFiabilite: { pct: 95, niveau: 'vert', label: 'Analyse fiable' },
    unmappedEtfs:     [],
    unmappedAll:      [],
    cryptoTotal:      0,
    cryptoCostTotal:  0,
    cryptoBreakdown:  [],
    lastUpdated:      '2026-05-17T12:00:00.000Z',
    ...overrides,
  }
}
