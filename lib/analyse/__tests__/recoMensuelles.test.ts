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
    profilType: 'Équilibré', prenom: 'Test',
    fireInputs: {
      age: 35, age_cible: 50,
      epargne_mensuelle: 800,
      revenu_passif_cible: 3000,
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
  it('détecte 40k cash sur 2k charges/mois (20 mois > 12)', () => {
    const out = genererActionsMensuelles(pat(), { today: TODAY })
    const cash = out.find((a) => a.type === 'invest_cash')
    expect(cash).toBeDefined()
    // Coussin = 6 × 2000 = 12000 ; aInvestir = 40000 - 12000 = 28000
    expect(cash!.montant).toBe(28_000)
    // toLocaleString('fr-FR') utilise U+202F (narrow no-break space) entre les milliers.
    expect(cash!.titre.replace(/\s/g, ' ')).toContain('28 000 €')
  })

  it('aucune action si cash <= 12 mois de charges', () => {
    const out = genererActionsMensuelles(pat({
      totalCash: 20_000,  // 10 mois de charges → sous le seuil
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
  it('détecte ETF surpondéré vs Crypto sous-pondérée → propose rebalance', () => {
    // L'algo cherche source surpondérée + cible présente assez sous-pondérée.
    // Setup : ETF 60 % (benchmark 20 → +40), Crypto 0.1 % (benchmark 5 → -4.9).
    // Note : -4.9 < -5 = false → règle ne déclenche pas. On force Crypto 0 %
    // mais Cash 5 % (benchmark 10 → -5 = pile à la limite, exclusive → faut < -5).
    // On va donc descendre Cash à 1 % (benchmark 10 → -9, sous-pondéré clairement).
    const out = genererActionsMensuelles(pat({
      totalBrut: 100_000, totalCash: 1_000,
      repartitionClasses: [
        { label: 'ETF / Fonds', valeur: 60_000, pourcentage: 60, color: '#10B981' },
        { label: 'Immobilier',  valeur: 39_000, pourcentage: 39, color: '#E8B84B' },
        { label: 'Cash',        valeur:  1_000, pourcentage:  1, color: '#71717a' },
      ],
      fireInputs: { ...pat().fireInputs, charges_mensuelles: 200 },  // évite cash dormant (5 mois)
    }), { today: TODAY })
    const drift = out.find((a) => a.type === 'rebalance')
    expect(drift).toBeDefined()
    expect(drift!.source).toBe('ETF / Fonds')
    expect(drift!.cible).toBe('Cash')
    expect(drift!.montant).toBeGreaterThan(0)
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
    // Surponderation "PEA" (label artificiel, benchmark=0 → ecart=+80) +
    // sous-ponderation "Obligataire" (benchmark=10, value=0 → ecart=-10).
    // → detectDriftAllocation cree une action rebalance source=PEA.
    // → l'opportunite PEA fiscale doit etre filtree par overlap.
    const out = genererActionsMensuelles(pat({
      totalCash: 5000,  // pas de cash dormant
      repartitionClasses: [
        { label: 'PEA',         valeur: 80_000, pourcentage: 80, color: '#10b981' },
        { label: 'ETF / Fonds', valeur: 20_000, pourcentage: 20, color: '#3b82f6' },
        { label: 'Obligataire', valeur:      0, pourcentage:  0, color: '#3b82f6' },
      ],
      totalBrut: 100_000,
    }), {
      today: TODAY,
      opportunitesFiscales: [makeOpp({ titre: 'Optimiser PEA' })],
    })
    // L'action drift doit etre la, l'opportunite PEA filtree.
    expect(out.find((a) => a.type === 'rebalance')).toBeDefined()
    expect(out.find((a) => a.type === 'fiscal')).toBeUndefined()
  })
})
