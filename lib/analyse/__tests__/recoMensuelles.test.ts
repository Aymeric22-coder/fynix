/**
 * Tests des actions du mois (Tâche C.2).
 *
 * 3 règles indépendantes : cash dormant, drift d'allocation, DCA en retard.
 * Chacune renvoie 0 ou 1 action. La sortie totale est ≤ 3.
 */
import { describe, it, expect } from 'vitest'
import {
  genererActionsMensuelles, DCA_SEUIL_JOURS, CASH_SEUIL_MOIS, DRIFT_SEUIL_PCT,
} from '../recoMensuelles'
import type { PatrimoineComplet } from '@/types/analyse'

const TODAY = new Date('2026-05-17T12:00:00Z')

function pat(over: Partial<PatrimoineComplet> = {}): PatrimoineComplet {
  return {
    totalBrut: 100000, totalNet: 100000,
    totalPortefeuille: 60000, totalImmo: 0, totalCash: 40000, totalDettes: 0,
    totalCashInvestissable: 0,
    totalImmoEquity: 0, risqueImmoGlobal: 30, revenuPassifImmo: 0,
    mensualitesImmoTotal: 0, rendementNetImmoMoyen: 0,
    positions: [], biens: [], comptes: [],
    repartitionClasses: [
      { label: 'ETF / Fonds', valeur: 60000, pourcentage: 60, color: '#10B981' },
      { label: 'Cash',        valeur: 40000, pourcentage: 40, color: '#71717a' },
    ],
    repartitionSectorielle: [],
    repartitionGeo: [],
    scoreDiversificationSectorielle: 50,
    scoreDiversificationGeo: 50,
    rendementEstime: 5,
    revenuPassifActuel: 0,
    projectionFIRESnapshot: null,
    lifeEvents:              [],
    profilType: 'Équilibré', prenom: 'Test',
    fireInputs: {
      age: 35, age_cible: 50,
      epargne_mensuelle: 800,
      revenu_passif_cible: 3000,
      revenu_passif_cible_ajuste: 3000,   // QW9 — pas d'ajustement famille dans cette fixture
      cibleFoyerDetail: {
        brut: 3000, ajuste: 3000, enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint: 0, situation_familiale: 'Célibataire', enfants: '0',
      revenu_mensuel_total: 5000,
      charges_mensuelles: 2000,
      risk_score: 50,
      enveloppes: [],
      tmi_rate: 30,
      tmi_estime: false,
      actions_eu_value: 0,
    },
    scores: {} as never, recommandations: [],
    analyseFiabilite: { pct: 100, niveau: 'vert', label: 'OK' },
    unmappedEtfs: [], unmappedAll: [],
    cryptoTotal: 0, cryptoCostTotal: 0, cryptoBreakdown: [],
    lastUpdated: TODAY.toISOString(),
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// Règle 1 — Cash dormant
// ─────────────────────────────────────────────────────────────────

describe('genererActionsMensuelles — cash dormant', () => {
  it('détecte 40k cash sur 2k charges/mois → reformulé en plan mensuel (V2.2-BIS)', () => {
    const out = genererActionsMensuelles(pat(), { today: TODAY })
    const cash = out.find((a) => a.type === 'invest_cash')
    expect(cash).toBeDefined()
    // V2.2-BIS — aInvestir naturel = 28k mais > plafond mensuel (epargne=800).
    // Conséquence : action reformulée en plan mensuel. `montant` = plafond mensuel.
    // Plafond = max(epargne=800, totalNet=100k * 5%/12 ≈ 416) = 800.
    expect(cash!.montant).toBe(800)
    // Le titre mentionne maintenant « /mois » plutôt que le montant cumulé.
    expect(cash!.titre).toContain('/mois')
    // Et le nombre de mois reflète le déploiement progressif (28000 / 800 = 35).
    expect(cash!.titre).toContain('35 mois')
  })

  it('aucune action si cash <= 12 mois de charges', () => {
    const out = genererActionsMensuelles(pat({
      totalCash: 20_000,  // 10 mois de charges → sous le seuil
    totalCashInvestissable: 0,
    }), { today: TODAY })
    expect(out.find((a) => a.type === 'invest_cash')).toBeUndefined()
  })

  it('aucune action si charges non renseignées', () => {
    const out = genererActionsMensuelles(pat({
      fireInputs: { ...pat().fireInputs, charges_mensuelles: 0 },
    }), { today: TODAY })
    expect(out.find((a) => a.type === 'invest_cash')).toBeUndefined()
  })

  it('respecte cashSeuilMois override', () => {
    // Cash 40k pour 2k/mois = 20 mois. Avec seuil 30 mois → pas d'action.
    const out = genererActionsMensuelles(pat(), { today: TODAY, cashSeuilMois: 30 })
    expect(out.find((a) => a.type === 'invest_cash')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// Règle 2 — Drift d'allocation
// ─────────────────────────────────────────────────────────────────

describe('genererActionsMensuelles — drift allocation', () => {
  it('détecte ETF surpondéré vs Cash sous-pondérée → reformulé en plan mensuel (V2.2-BIS)', () => {
    // V2.2-BIS — Un drift réaliste reste ≤ 10 % du patrimoine net. La rule
    // « > 10 % net = suppress » s'applique uniquement aux mouvements
    // structurels (vente d'actif majeur). Setup : ETF 26 % (benchmark 20,
    // +6 pp), Cash 4 % (benchmark 10, -6 pp). Montant naturel = 6 % × 100k
    // = 6000 €, soit 6 % du net → pas de suppression structurelle. Mais
    // 6000 > plafond mensuel 800 → reformulé en plan mensuel.
    const out = genererActionsMensuelles(pat({
      totalBrut: 100_000, totalCash: 4_000,
      totalCashInvestissable: 0,
      repartitionClasses: [
        { label: 'ETF / Fonds', valeur: 26_000, pourcentage: 26, color: '#10B981' },
        { label: 'Immobilier',  valeur: 35_000, pourcentage: 35, color: '#E8B84B' },
        { label: 'Actions',     valeur: 20_000, pourcentage: 20, color: '#10B981' },
        { label: 'Obligataire', valeur: 10_000, pourcentage: 10, color: '#3b82f6' },
        { label: 'Crypto',      valeur:  5_000, pourcentage:  5, color: '#a855f7' },
        { label: 'Cash',        valeur:  4_000, pourcentage:  4, color: '#71717a' },
      ],
      fireInputs: { ...pat().fireInputs, charges_mensuelles: 800 },  // évite cash dormant
    }), { today: TODAY })
    const drift = out.find((a) => a.type === 'rebalance')
    expect(drift).toBeDefined()
    expect(drift!.source).toBe('ETF / Fonds')
    expect(drift!.cible).toBe('Cash')
    expect(drift!.montant).toBeGreaterThan(0)
    // V2.2-BIS — Le libellé doit refléter le plan progressif.
    expect(drift!.titre.toLowerCase()).toContain('progressivement')
  })

  it('rebalance > 10 % du patrimoine net → action SUPPRIMÉE (V2.2-BIS)', () => {
    // Setup : ETF 80 %, Cash 1 % → drift naturel ~80 % × 100k = 80 000 €,
    // soit 80 % du net. C'est une vente d'actif majeur, irréaliste en 1 mois.
    // V2.2-BIS supprime la reco plutôt que de la dégrader en plan sur 100 mois.
    const out = genererActionsMensuelles(pat({
      totalBrut: 100_000, totalCash: 1_000,
      totalCashInvestissable: 0,
      repartitionClasses: [
        { label: 'ETF / Fonds', valeur: 80_000, pourcentage: 80, color: '#10B981' },
        { label: 'Immobilier',  valeur: 19_000, pourcentage: 19, color: '#E8B84B' },
        { label: 'Cash',        valeur:  1_000, pourcentage:  1, color: '#71717a' },
      ],
      fireInputs: { ...pat().fireInputs, charges_mensuelles: 200 },
    }), { today: TODAY })
    const drift = out.find((a) => a.type === 'rebalance')
    expect(drift).toBeUndefined()
  })

  it('aucune action si tous les écarts < 5 points', () => {
    const out = genererActionsMensuelles(pat({
      repartitionClasses: [
        { label: 'ETF / Fonds', valeur: 22000, pourcentage: 22, color: '#10B981' },
        { label: 'Actions',     valeur: 23000, pourcentage: 23, color: '#38BDF8' },
        { label: 'Immobilier',  valeur: 35000, pourcentage: 35, color: '#E8B84B' },
        { label: 'Cash',        valeur: 10000, pourcentage: 10, color: '#71717a' },
        { label: 'Crypto',      valeur:  5000, pourcentage:  5, color: '#a855f7' },
        { label: 'Obligataire', valeur:  5000, pourcentage:  5, color: '#3b82f6' },
      ],
      totalCash: 10000,
    totalCashInvestissable: 0,
      fireInputs: { ...pat().fireInputs, charges_mensuelles: 5000 },  // évite cash dormant
    }), { today: TODAY })
    expect(out.find((a) => a.type === 'rebalance')).toBeUndefined()
  })

  it('aucune action si patrimoine vide', () => {
    const out = genererActionsMensuelles(pat({
      totalBrut: 0, repartitionClasses: [],
    }), { today: TODAY })
    expect(out.find((a) => a.type === 'rebalance')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// Règle 3 — DCA en retard
// ─────────────────────────────────────────────────────────────────

describe('genererActionsMensuelles — DCA en retard', () => {
  it('détecte 90 jours sans ajout (> seuil 60)', () => {
    const ninetyDaysAgo = new Date(TODAY.getTime() - 90 * 24 * 3600 * 1000).toISOString()
    const out = genererActionsMensuelles(pat(), {
      today: TODAY, lastPositionAddedAt: ninetyDaysAgo,
    })
    const dca = out.find((a) => a.type === 'dca_retard')
    expect(dca).toBeDefined()
    expect(dca!.titre).toContain('90')
    expect(dca!.montant).toBe(800)  // epargne_mensuelle
  })

  it('aucune action si < 60 jours sans ajout', () => {
    const thirtyDaysAgo = new Date(TODAY.getTime() - 30 * 24 * 3600 * 1000).toISOString()
    const out = genererActionsMensuelles(pat(), {
      today: TODAY, lastPositionAddedAt: thirtyDaysAgo,
    })
    expect(out.find((a) => a.type === 'dca_retard')).toBeUndefined()
  })

  it('aucune action si lastPositionAddedAt non fourni', () => {
    const out = genererActionsMensuelles(pat(), { today: TODAY })
    expect(out.find((a) => a.type === 'dca_retard')).toBeUndefined()
  })

  it('aucune action si épargne mensuelle = 0', () => {
    const ninetyDaysAgo = new Date(TODAY.getTime() - 90 * 24 * 3600 * 1000).toISOString()
    const out = genererActionsMensuelles(pat({
      fireInputs: { ...pat().fireInputs, epargne_mensuelle: 0 },
    }), { today: TODAY, lastPositionAddedAt: ninetyDaysAgo })
    expect(out.find((a) => a.type === 'dca_retard')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// Comportement global
// ─────────────────────────────────────────────────────────────────

describe('genererActionsMensuelles — global', () => {
  it('renvoie au plus 3 actions (1 par règle)', () => {
    const ninetyDaysAgo = new Date(TODAY.getTime() - 90 * 24 * 3600 * 1000).toISOString()
    const out = genererActionsMensuelles(pat(), {
      today: TODAY, lastPositionAddedAt: ninetyDaysAgo,
    })
    expect(out.length).toBeLessThanOrEqual(3)
  })

  it('ordre : cash dormant > rebalance > DCA retard', () => {
    const ninetyDaysAgo = new Date(TODAY.getTime() - 90 * 24 * 3600 * 1000).toISOString()
    const out = genererActionsMensuelles(pat(), {
      today: TODAY, lastPositionAddedAt: ninetyDaysAgo,
    })
    const types = out.map((a) => a.type)
    const expectedOrder: typeof types = ['invest_cash', 'rebalance', 'dca_retard']
    // Vérifie que chaque type présent apparaît dans le bon ordre relatif.
    const indices = expectedOrder.map((t) => types.indexOf(t)).filter((i) => i >= 0)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it('liste vide si aucune règle déclenchée', () => {
    const out = genererActionsMensuelles(pat({
      totalCash: 5000,  // 2.5 mois, sous le seuil
    totalCashInvestissable: 0,
      repartitionClasses: [
        { label: 'ETF / Fonds', valeur: 50000, pourcentage: 20, color: '#10B981' },
        { label: 'Actions',     valeur: 50000, pourcentage: 20, color: '#38BDF8' },
        { label: 'Immobilier',  valeur: 90000, pourcentage: 35, color: '#E8B84B' },
        { label: 'Cash',        valeur:  5000, pourcentage: 10, color: '#71717a' },
        { label: 'Crypto',      valeur:  5000, pourcentage:  5, color: '#a855f7' },
        { label: 'Obligataire', valeur: 10000, pourcentage: 10, color: '#3b82f6' },
      ],
      totalBrut: 210000,
    }), { today: TODAY })
    expect(out).toEqual([])
  })
})

describe('constantes seuils', () => {
  it('valeurs documentées', () => {
    expect(DRIFT_SEUIL_PCT).toBe(5)
    expect(CASH_SEUIL_MOIS).toBe(12)
    expect(DCA_SEUIL_JOURS).toBe(60)
  })
})

// ─────────────────────────────────────────────────────────────────
// Sprint 1 — I3 : injection des opportunites fiscales
// ─────────────────────────────────────────────────────────────────

import type { OpportuniteFiscale } from '../optimiseurFiscal'

function makeOpp(over: Partial<OpportuniteFiscale> = {}): OpportuniteFiscale {
  return {
    id:                'opp-pea',
    categorie:         'enveloppe',
    titre:             'Ouvrir un PEA',
    description:       'Transferer X € sur PEA',
    gain_annuel_eur:   600,
    gain_5ans_eur:     3000,
    effort:            'faible',
    priorite:          1,
    action_concrete:   'Ouvrir un PEA chez un courtier en ligne et transferer vos actions europeennes.',
    conditions:        [],
    applicable:        true,
    ...over,
  }
}

describe('genererActionsMensuelles — injection opportunites fiscales (I3)', () => {
  it('user TMI 30 + actions hors PEA → action fiscal apparait dans la liste', () => {
    const out = genererActionsMensuelles(pat({
      totalCash: 5000, // pas de cash dormant
    totalCashInvestissable: 0,
      repartitionClasses: [],
      totalBrut: 50_000,
    }), {
      today: TODAY,
      opportunitesFiscales: [makeOpp()],
    })
    const fiscal = out.find((a) => a.type === 'fiscal')
    expect(fiscal).toBeDefined()
    expect(fiscal!.priorite).toBe('haute')
    expect(fiscal!.titre).toContain('PEA')
    expect(fiscal!.titre).toContain('600')
  })

  it('aucune opportunite fournie → liste inchangee (compat retro)', () => {
    const baseOut = genererActionsMensuelles(pat(), { today: TODAY })
    const withOpps = genererActionsMensuelles(pat(), {
      today: TODAY,
      opportunitesFiscales: [],
    })
    expect(withOpps).toEqual(baseOut)
  })

  it('opportunites non applicables ignorees', () => {
    const out = genererActionsMensuelles(pat({ totalCash: 5000 }), {
      today: TODAY,
      opportunitesFiscales: [
        makeOpp({ applicable: false }),
        makeOpp({ id: 'opp-no-gain', gain_annuel_eur: 0 }),
      ],
    })
    expect(out.find((a) => a.type === 'fiscal')).toBeUndefined()
  })

  it('garde les 2 plus gros gains parmi les opportunites applicables', () => {
    const out = genererActionsMensuelles(pat({
      totalCash: 5000, repartitionClasses: [], totalBrut: 50_000,
    totalCashInvestissable: 0,
    }), {
      today: TODAY,
      opportunitesFiscales: [
        makeOpp({ id: 'opp-a', titre: 'Ouvrir PER',           gain_annuel_eur: 1000 }),
        makeOpp({ id: 'opp-b', titre: 'Reorganiser fonds',    gain_annuel_eur: 1500 }),
        makeOpp({ id: 'opp-c', titre: 'Optimiser AV',         gain_annuel_eur:  300 }),
      ],
    })
    const fiscales = out.filter((a) => a.type === 'fiscal')
    expect(fiscales).toHaveLength(2)
    // Les 2 plus gros gains : 1500 (opp-b) et 1000 (opp-a)
    expect(fiscales.map((a) => a.id)).toEqual([
      'fiscal-opp-b', 'fiscal-opp-a',
    ])
  })

  it('plafonne le total a maxActions (defaut 5)', () => {
    const ninetyDaysAgo = new Date(TODAY.getTime() - 90 * 24 * 3600 * 1000).toISOString()
    // pat() declenche cash + drift + DCA = 3 regles, + 2 fiscales = 5
    const out = genererActionsMensuelles(pat(), {
      today: TODAY,
      lastPositionAddedAt: ninetyDaysAgo,
      opportunitesFiscales: [
        makeOpp({ id: 'a', titre: 'PER',           gain_annuel_eur: 2000 }),
        makeOpp({ id: 'b', titre: 'CTO transfer',  gain_annuel_eur: 1000 }),
      ],
    })
    expect(out.length).toBeLessThanOrEqual(5)
  })

  it('opportunite PEA filtree si une action drift mentionne deja "PEA"', () => {
    // V2.2-BIS — Surponderation "PEA" calibrée pour rester sous le seuil
    // structurel 10 % net (sinon le rebalance serait supprimé et le test
    // ne pourrait plus vérifier l'overlap). PEA à 8 % (benchmark 0 → +8 pp),
    // Obligataire à 4 % (benchmark 10 → -6 pp). Drift montant naturel = 8 %
    // × 100k = 8000 €, soit 8 % du net → conservé (monthlyPlan).
    // Le `source.label` = 'PEA' permet à overlapsExistingAction de filtrer
    // l'opportunité fiscale PEA.
    const out = genererActionsMensuelles(pat({
      totalCash: 5_000,  // pas de cash dormant
      totalCashInvestissable: 0,
      repartitionClasses: [
        { label: 'PEA',         valeur:  8_000, pourcentage:  8, color: '#10b981' },
        { label: 'ETF / Fonds', valeur: 20_000, pourcentage: 20, color: '#3b82f6' },
        { label: 'Actions',     valeur: 20_000, pourcentage: 20, color: '#3b82f6' },
        { label: 'Immobilier',  valeur: 35_000, pourcentage: 35, color: '#E8B84B' },
        { label: 'Cash',        valeur:  5_000, pourcentage:  5, color: '#71717a' },
        { label: 'Obligataire', valeur:  4_000, pourcentage:  4, color: '#3b82f6' },
        { label: 'Crypto',      valeur:  8_000, pourcentage:  8, color: '#a855f7' },
      ],
      totalBrut: 100_000,
      fireInputs: { ...pat().fireInputs, charges_mensuelles: 200 },
    }), {
      today: TODAY,
      opportunitesFiscales: [makeOpp({ titre: 'Optimiser PEA' })],
    })
    // L'action drift doit etre la (source='PEA'), l'opportunite PEA filtree.
    const drift = out.find((a) => a.type === 'rebalance')
    expect(drift).toBeDefined()
    expect(drift!.source).toBe('PEA')
    expect(out.find((a) => a.type === 'fiscal')).toBeUndefined()
  })
})
