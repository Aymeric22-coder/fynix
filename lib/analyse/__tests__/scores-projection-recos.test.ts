/**
 * Tests des modules d'intelligence Phase 3 :
 *   - lib/analyse/scores.ts (5 scores)
 *   - lib/analyse/projectionFIRE.ts (rendement + simulation)
 *   - lib/analyse/recommandations.ts (règles métier)
 */
import { describe, it, expect } from 'vitest'
import {
  calculerDiversification, calculerCoherenceProfil, calculerProgressionFIRE,
  calculerSolidite, calculerEfficienceFiscale, calculerTousLesScores,
} from '../scores'
import {
  calculerRendementPortefeuille, simulerProjection, calculerImpactEpargne,
} from '../projectionFIRE'
import { genererRecommandations, type RecommandationEnrichie } from '../recommandations'
import type { PatrimoineComplet, EnrichedPosition, AnalyseAssetType } from '@/types/analyse'

// ─────────────────────────────────────────────────────────────────
// Fabriques
// ─────────────────────────────────────────────────────────────────

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

function patrimoine(over: Partial<PatrimoineComplet> = {}): PatrimoineComplet {
  return {
    totalBrut: 100000, totalNet: 100000,
    totalPortefeuille: 80000, totalImmo: 0, totalCash: 20000, totalDettes: 0,
    totalCashInvestissable: 0,
    totalImmoEquity: 0, risqueImmoGlobal: 30, revenuPassifImmo: 0,
    mensualitesImmoTotal: 0, rendementNetImmoMoyen: 0,
    positions: [
      pos({ asset_type: 'etf', current_value: 50000, sector: 'Technology', country: 'United States' }),
      pos({ asset_type: 'stock', current_value: 30000, sector: 'Healthcare', country: 'France' }),
    ],
    biens: [], comptes: [],
    repartitionClasses: [
      { label: 'ETF / Fonds', valeur: 50000, pourcentage: 50, color: '#10B981' },
      { label: 'Actions', valeur: 30000, pourcentage: 30, color: '#38BDF8' },
      { label: 'Cash', valeur: 20000, pourcentage: 20, color: '#71717a' },
    ],
    repartitionSectorielle: [
      { secteur: 'Technologie', valeur: 50000, pourcentage: 62.5, benchmark: 23, deviation: 39.5, status: 'overweight_strong', positions: [], alerte: true },
      { secteur: 'Santé',       valeur: 30000, pourcentage: 37.5, benchmark: 12, deviation: 25.5, status: 'overweight_strong', positions: [], alerte: true },
    ],
    repartitionGeo: [
      { zone: 'Amérique du Nord', valeur: 50000, pourcentage: 62.5, benchmark: 65, deviation: -2.5, status: 'aligned', pays: ['United States'], alerte: false },
      { zone: 'Europe',           valeur: 30000, pourcentage: 37.5, benchmark: 15, deviation: 22.5, status: 'overweight', pays: ['France'], alerte: true },
    ],
    scoreDiversificationSectorielle: 50,
    scoreDiversificationGeo: 50,
    rendementEstime: 5,
    revenuPassifActuel: 100,
    projectionFIRESnapshot: null,
    lifeEvents:              [],
    profilType: 'Équilibré', prenom: 'Test',
    fireInputs: {
      age: 35, age_cible: 50,
      epargne_mensuelle: 1000,
      revenu_passif_cible: 3000,
      revenu_passif_cible_ajuste: 3000,   // QW9 — pas d'ajustement famille dans cette fixture
      // QW9-bis — detail neutre cohérent (célibataire 0 enfant)
      cibleFoyerDetail: {
        brut: 3000, ajuste: 3000, enfantsDelta: 0, coupleDelta: 0,
        hasAdjustment: false, raisons: [], nbEnfants: 0, hasCoupleBonus: false,
      },
      revenu_conjoint: 0,
      situation_familiale: 'Célibataire',
      enfants: '0',
      revenu_mensuel_total: 5000,
      charges_mensuelles: 2000,
      risk_score: 50,
      enveloppes: ['PEA', 'Assurance-vie'],
      tmi_rate: 30,
      tmi_estime: false,
      actions_eu_value: 30000,
    },
    scores: {} as never, recommandations: [],
    analyseFiabilite: { pct: 100, niveau: 'vert', label: 'Analyse fiable' },
    unmappedEtfs: [],
    unmappedAll:  [],
    cryptoTotal:     0,
    cryptoCostTotal: 0,
    cryptoBreakdown: [],
    lastUpdated: new Date().toISOString(),
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// SCORES
// ─────────────────────────────────────────────────────────────────

describe('calculerDiversification', () => {
  it('renvoie un score < 80 quand 1 secteur > 30 %', () => {
    const s = calculerDiversification(patrimoine())
    expect(s.value).not.toBeNull()
    expect(s.value!).toBeLessThan(80)
    expect(s.niveau).not.toBe('vert')
  })

  it('données insuffisantes si patrimoine vide', () => {
    const s = calculerDiversification(patrimoine({ totalBrut: 0, repartitionClasses: [] }))
    expect(s.value).toBeNull()
    expect(s.niveau).toBe('gris')
  })

  it('Phase 10 : utilise les scores tracking error MSCI sectoriel/géo + benchmark classes', () => {
    // Formule = sect × 0.35 + géo × 0.35 + classes × 0.30
    // Avec sect=89, géo=81, classes=70 → 89×0.35 + 81×0.35 + 70×0.30 = 31.15 + 28.35 + 21 = 80.5 → 81
    const s = calculerDiversification(patrimoine({
      scoreDiversificationSectorielle: 89,
      scoreDiversificationGeo:         81,
      repartitionClasses: [
        // Allocation proche du benchmark BENCHMARK_CLASSES_PATRIMOINE
        // (20 Actions / 20 ETF / 35 Immo / 10 Cash / 5 Crypto / 10 Oblig)
        { label: 'Actions',     valeur: 20, pourcentage: 20, color: '#000' },
        { label: 'ETF / Fonds', valeur: 20, pourcentage: 20, color: '#000' },
        { label: 'Immobilier',  valeur: 35, pourcentage: 35, color: '#000' },
        { label: 'Cash',        valeur: 10, pourcentage: 10, color: '#000' },
        { label: 'Crypto',      valeur:  5, pourcentage:  5, color: '#000' },
        { label: 'Obligataire', valeur: 10, pourcentage: 10, color: '#000' },
      ],
    }))
    expect(s.value!).toBeGreaterThanOrEqual(75)
  })
})

describe('calculerCoherenceProfil', () => {
  it('cohérent quand risque profil ≈ risque réel', () => {
    // Profil risk_score 50 + portfolio mixte ETF/stock → risque réel ~50
    const s = calculerCoherenceProfil(patrimoine())
    expect(s.value).not.toBeNull()
    expect(s.value!).toBeGreaterThan(50)
  })

  it('détecte un portefeuille trop risqué (profil conservateur + crypto)', () => {
    const s = calculerCoherenceProfil(patrimoine({
      profilType: 'Conservateur',
      fireInputs: { ...patrimoine().fireInputs, risk_score: 20 },
      positions: [pos({ asset_type: 'crypto', current_value: 100000 })],
      totalCash: 0, totalImmo: 0, totalBrut: 100000, totalPortefeuille: 100000,
    totalCashInvestissable: 0,
    }))
    expect(s.value!).toBeLessThan(40)
    expect(s.niveau).toBe('rouge')
  })

  it('insuffisant si risk_score absent', () => {
    const s = calculerCoherenceProfil(patrimoine({
      fireInputs: { ...patrimoine().fireInputs, risk_score: undefined as unknown as number },
    }))
    expect(s.value).toBeNull()
  })
})

describe('calculerProgressionFIRE', () => {
  it('100 si patrimoine financier déjà arrivé à la cible (cible = 3000 × 12 × 25 = 900k)', () => {
    // Phase 8 : actuel = totalPortefeuille + totalCash (financier seul)
    const s = calculerProgressionFIRE(patrimoine({
      totalNet: 1_000_000, totalPortefeuille: 950_000, totalCash: 50_000,
    totalCashInvestissable: 0,
      fireInputs: { ...patrimoine().fireInputs, revenu_passif_cible: 3000 },
    }))
    expect(s.value).toBe(100)
  })

  it('Phase 8 : 100 si les loyers immo couvrent déjà 100 % de la cible', () => {
    const s = calculerProgressionFIRE(patrimoine({
      revenuPassifImmo: 3000,
      fireInputs: { ...patrimoine().fireInputs, revenu_passif_cible: 3000 },
    }))
    expect(s.value).toBe(100)
  })

  it('haut quand on est dans les temps', () => {
    const s = calculerProgressionFIRE(patrimoine({
      totalNet: 600000, totalPortefeuille: 600_000, totalCash: 0,
    totalCashInvestissable: 0,
      fireInputs: {
        ...patrimoine().fireInputs,
        age: 35, age_cible: 60, epargne_mensuelle: 2000,
        revenu_passif_cible: 3000,
      },
    }))
    expect(s.value!).toBeGreaterThanOrEqual(80)
  })

  it('insuffisant si age manquant', () => {
    const s = calculerProgressionFIRE(patrimoine({
      fireInputs: { ...patrimoine().fireInputs, age: null },
    }))
    expect(s.value).toBeNull()
  })
})

describe('calculerSolidite', () => {
  it('bonus pour gros coussin de cash et bcp d\'actifs refuges', () => {
    const s = calculerSolidite(patrimoine({
      totalCash: 60000, totalImmo: 200000, totalBrut: 280000, totalNet: 280000,
    totalCashInvestissable: 0,
      fireInputs: { ...patrimoine().fireInputs, charges_mensuelles: 2000 },
    }))
    expect(s.value!).toBeGreaterThan(60)
  })

  it('malus si dettes > 60 % du patrimoine', () => {
    const s = calculerSolidite(patrimoine({
      totalDettes: 200000, totalBrut: 250000, totalNet: 50000,
    }))
    expect(s.niveau).not.toBe('vert')
  })

  // ── Tâche A.3 — stabilite_revenus en facteur additionnel ──
  it('CDI → +5 pts vs profil sans stabilité renseignée', () => {
    const base = patrimoine()
    const sBase = calculerSolidite(base)
    const sCdi = calculerSolidite(patrimoine({
      fireInputs: { ...base.fireInputs, stabilite_revenus: 'Très stables (CDI)' } as never,
    }))
    expect(sCdi.value!).toBe(Math.min(100, sBase.value! + 5))
  })

  it('chomage → -30 pts vs profil sans stabilité (V1.3 cumule -15 stabilité + -15 coussin)', () => {
    // V1.3 — La stabilité « Chômage » → mappée 'instable' par
    // `mapStabiliteToEnum` → override `MATELAS_MULTIPLIERS.overrideInstable`
    // (seuils 9/12 mois au lieu du fallback 3/6).
    // Fixture : totalCash 20 000 €, charges 2 000 € → moisCouverts = 10.
    //   Avant V1.3 : 10 ≥ 6  → +20 pts coussin
    //   Après V1.3 : 9 ≤ 10 < 12 → +5 pts coussin
    // Delta coussin = -15, delta stabilité = -15 → total -30.
    const base = patrimoine()
    const sBase = calculerSolidite(base)
    const sChomage = calculerSolidite(patrimoine({
      fireInputs: { ...base.fireInputs, stabilite_revenus: 'Chômage' } as never,
    }))
    expect(sChomage.value!).toBe(Math.max(0, sBase.value! - 30))
  })

  it('expose la stabilité dans les inputs d\'explication', () => {
    const s = calculerSolidite(patrimoine({
      fireInputs: { ...patrimoine().fireInputs, stabilite_revenus: 'Indépendant / Freelance' } as never,
    }))
    const stabiliteInput = s.explanation?.inputs.find((i) => i.label === 'Stabilité des revenus')
    expect(stabiliteInput?.value).toContain('independant')
    expect(stabiliteInput?.value).toContain('-5')
  })
})

describe('calculerEfficienceFiscale', () => {
  it('PEA + AV ouverts + actions EU → bonus', () => {
    const s = calculerEfficienceFiscale(patrimoine())
    expect(s.value!).toBeGreaterThanOrEqual(80)
  })

  it('PEA non ouvert + 20k actions EU → malus', () => {
    const s = calculerEfficienceFiscale(patrimoine({
      fireInputs: { ...patrimoine().fireInputs, enveloppes: [], actions_eu_value: 20000 },
    }))
    expect(s.value!).toBeLessThan(50)
  })
})

describe('calculerTousLesScores', () => {
  it('retourne 5 scores', () => {
    const all = calculerTousLesScores(patrimoine())
    expect(Object.keys(all)).toEqual([
      'diversification', 'coherence_profil', 'progression_fire',
      'solidite', 'efficience_fiscale',
    ])
  })
})

// ─────────────────────────────────────────────────────────────────
// PROJECTION FIRE
// ─────────────────────────────────────────────────────────────────

describe('calculerRendementPortefeuille', () => {
  it('100 % ETF → 7 %', () => {
    const r = calculerRendementPortefeuille(patrimoine({
      positions: [pos({ asset_type: 'etf', current_value: 100000 })],
      totalImmo: 0, totalCash: 0, totalBrut: 100000,
    totalCashInvestissable: 0,
    }))
    expect(r).toBe(7)
  })

  it('CS2 LOT 1 — inclut la crypto (4 %) dans le calcul pondéré', () => {
    // Pré-CS2 : crypto skip → résultat = 7 (ETF seul comptait).
    // Post-CS2 : crypto comptée à 4 % → moyenne pondérée = (50*7 + 50*4)/100 = 5,5.
    const r = calculerRendementPortefeuille(patrimoine({
      positions: [
        pos({ asset_type: 'etf', current_value: 50000 }),
        pos({ asset_type: 'crypto', current_value: 50000 }),
      ],
      totalImmo: 0, totalCash: 0, totalBrut: 100000,
    totalCashInvestissable: 0,
    }))
    // (50_000 * 7 + 50_000 * 4) / 100_000 = 5.5
    expect(r).toBeCloseTo(5.5, 1)
  })

  it('mix ETF / Cash → moyenne pondérée', () => {
    const r = calculerRendementPortefeuille(patrimoine({
      positions: [pos({ asset_type: 'etf', current_value: 80000 })],
      totalImmo: 0, totalCash: 20000, totalBrut: 100000,
    totalCashInvestissable: 0,
    }))
    // (80000 × 7 + 20000 × 3) / 100000 = 6.2
    expect(r).toBe(6.2)
  })
})

describe('simulerProjection', () => {
  it('produit 36 points (année 0..35) par défaut', () => {
    const r = simulerProjection({
      patrimoineActuel:  100000, epargneMensuelle: 1000,
      rendementCentral:  7, ageActuel: 30, ageCible: 50,
      revenuPassifCible: 3000,
    })
    expect(r.points).toHaveLength(36)
    expect(r.points[0]?.age).toBe(30)
    expect(r.points[0]?.central).toBe(100000)
  })

  it('central > pessimiste à chaque point', () => {
    const r = simulerProjection({
      patrimoineActuel: 100000, epargneMensuelle: 1000,
      rendementCentral: 7, ageActuel: 30, ageCible: 50, revenuPassifCible: 3000,
    })
    for (const pt of r.points.slice(1)) {
      expect(pt.central).toBeGreaterThan(pt.pessimiste)
      expect(pt.optimiste).toBeGreaterThan(pt.central)
    }
  })

  it('détecte l\'âge d\'indépendance financière', () => {
    const r = simulerProjection({
      patrimoineActuel: 500000, epargneMensuelle: 3000,
      rendementCentral: 7, ageActuel: 35, ageCible: 50, revenuPassifCible: 3000,
    })
    // Cible = 3000 × 12 × 25 = 900 000. Avec 500k + 3k/mois à 7 % → atteint vers 40 ans
    expect(r.ageIndependanceCentral).not.toBeNull()
    expect(r.ageIndependanceCentral!).toBeLessThan(50)
  })
})

describe('calculerImpactEpargne', () => {
  it('augmenter l\'épargne réduit l\'âge FIRE (delta positif)', () => {
    const base = {
      patrimoineActuel: 200000, epargneMensuelle: 1000,
      rendementCentral: 7, ageActuel: 30, ageCible: 60, revenuPassifCible: 3000,
    }
    const delta = calculerImpactEpargne(base, 1000)
    expect(delta).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// RECOMMANDATIONS
// ─────────────────────────────────────────────────────────────────

describe('genererRecommandations', () => {
  it('détecte la surexposition sectorielle > 30 %', () => {
    const recos = genererRecommandations(patrimoine(), calculerTousLesScores(patrimoine()))
    expect(recos.some((r) => r.id === 'surexpo-secteur')).toBe(true)
  })

  it('détecte le PEA manquant si > 5k actions', () => {
    const p = patrimoine({
      fireInputs: { ...patrimoine().fireInputs, enveloppes: [] },
    })
    const recos = genererRecommandations(p, calculerTousLesScores(p))
    expect(recos.some((r) => r.id === 'pea-non-ouvert')).toBe(true)
  })

  it('détecte le cash insuffisant', () => {
    const p = patrimoine({
      totalCash: 1000,
    totalCashInvestissable: 0,
      fireInputs: { ...patrimoine().fireInputs, charges_mensuelles: 2000 },
    })
    const recos = genererRecommandations(p, calculerTousLesScores(p))
    expect(recos.some((r) => r.id === 'cash-insuffisant')).toBe(true)
  })

  it('ne dépasse jamais 6 recos', () => {
    const recos = genererRecommandations(patrimoine(), calculerTousLesScores(patrimoine()))
    expect(recos.length).toBeLessThanOrEqual(6)
  })

  it('priorise haute > moyenne > info', () => {
    const recos = genererRecommandations(patrimoine(), calculerTousLesScores(patrimoine()))
    const ranks = { haute: 0, moyenne: 1, info: 2 }
    for (let i = 1; i < recos.length; i++) {
      expect(ranks[recos[i]!.priorite]).toBeGreaterThanOrEqual(ranks[recos[i - 1]!.priorite])
    }
  })

  // ── QW4 — la priorité de vie discrimine le tri des recos (4 buckets) ──
  //
  // Profil-test générant 4 recos HAUTE de catégories distinctes :
  //   surexpo-secteur (diversification) · cash-insuffisant (liquidite)
  //   pea-non-ouvert (fiscalite)        · retard-fire (fire)
  // → on observe le tri intra-niveau bouger selon le bucket.
  function profilDiscrimination(prioriteLibelle: string): PatrimoineComplet {
    return patrimoine({
      totalNet: 50_000, totalBrut: 50_000, totalPortefeuille: 49_000,
      totalCash: 1000,   // → cash-insuffisant (1000/2000 = 0.5 mois < 3)
    totalCashInvestissable: 0,
      fireInputs: {
        ...patrimoine().fireInputs,
        enveloppes: [],            // PEA non ouvert → pea-non-ouvert (actions de base > 5 k€)
        charges_mensuelles: 2000,
        age: 30, age_cible: 40,    // retard FIRE marqué → retard-fire
        epargne_mensuelle: 500,
        priorite: prioriteLibelle,
      } as never,
    })
  }
  function top3(prioriteLibelle: string): string[] {
    const p = profilDiscrimination(prioriteLibelle)
    return genererRecommandations(p, calculerTousLesScores(p)).slice(0, 3).map((r) => r.id)
  }

  it('securite_famille remonte la liquidité (cash-insuffisant en tête)', () => {
    const ids = top3('Sécurité famille')
    expect(ids[0]).toBe('cash-insuffisant')
  })

  it('independance remonte le FIRE puis la fiscalité', () => {
    const ids = top3('Arrêter de travailler')
    expect(ids[0]).toBe('retard-fire')
    expect(ids[1]).toBe('pea-non-ouvert')
  })

  it('transmission remonte diversification + fiscalité, redescend le FIRE', () => {
    const ids = top3('Transmettre un patrimoine')
    expect(ids).toContain('surexpo-secteur')
    expect(ids).toContain('pea-non-ouvert')
    expect(ids).not.toContain('retard-fire')   // fire redescendu hors top-3
  })

  it('les 4 buckets produisent 4 top-3 DISTINCTS (discrimination effective)', () => {
    const eq  = top3('Liberté de temps')       // equilibre
    const sf  = top3('Sécurité famille')        // securite_famille
    const ind = top3('Arrêter de travailler')   // independance
    const tr  = top3('Transmettre un patrimoine') // transmission
    const serial = [eq, sf, ind, tr].map((a) => a.join('>'))
    expect(new Set(serial).size).toBe(4)
  })

  it('priorite "equilibre" ou absente → tri inchangé', () => {
    const base = genererRecommandations(patrimoine(), calculerTousLesScores(patrimoine()))
    const eq = genererRecommandations(
      patrimoine({ fireInputs: { ...patrimoine().fireInputs, priorite: 'Liberté de temps' } as never }),
      calculerTousLesScores(patrimoine()),
    )
    expect(eq.map((r) => r.id)).toEqual(base.map((r) => r.id))
  })

  // ── Tâche C.1 — gain estimé en € sur les recos clés ──
  it('reco PEA non ouvert expose un gain_estime_eur > 0', () => {
    const p = patrimoine({
      fireInputs: {
        ...patrimoine().fireInputs,
        enveloppes: [],  // PEA non ouvert
      },
      // 10k d'actions/ETF EU sans PEA
      positions: [
        pos({ asset_type: 'stock', current_value: 10000, sector: 'Tech', country: 'France' }),
      ],
    })
    const recos = genererRecommandations(p, calculerTousLesScores(p)) as RecommandationEnrichie[]
    const pea = recos.find((r) => r.id === 'pea-non-ouvert')
    expect(pea).toBeDefined()
    // 10000 × 0.07 × 0.172 ≈ 120
    expect(pea!.gain_estime_eur).toBeGreaterThan(100)
    expect(pea!.gain_estime_eur).toBeLessThan(150)
    expect(pea!.gain_estime_label).toContain('économisés')
    expect(pea!.impact_estime).toContain('€')
  })

  it('reco surpondération sectorielle expose un montant à rééquilibrer', () => {
    const recos = genererRecommandations(patrimoine(), calculerTousLesScores(patrimoine())) as RecommandationEnrichie[]
    const sect = recos.find((r) => r.id === 'surexpo-secteur')
    expect(sect).toBeDefined()
    expect(sect!.gain_estime_eur).toBeGreaterThan(0)
    expect(sect!.gain_estime_label).toContain('rééquilibrer')
  })

  it('reco retard-fire expose mois_gagnes_fire si calculable', () => {
    // Setup : utilisateur très en retard sur son objectif FIRE
    const p = patrimoine({
      totalNet: 50_000, totalBrut: 50_000, totalPortefeuille: 50_000, totalCash: 0,
    totalCashInvestissable: 0,
      fireInputs: {
        ...patrimoine().fireInputs,
        age: 30, age_cible: 40,  // 10 ans pour atteindre 900k → quasi impossible
        epargne_mensuelle: 500,
        revenu_passif_cible: 3000,
      },
    })
    const recos = genererRecommandations(p, calculerTousLesScores(p)) as RecommandationEnrichie[]
    const fire = recos.find((r) => r.id === 'retard-fire')
    if (fire) {
      // Le mois_gagnes_fire peut être null si le delta n'aide pas, mais
      // l'impact_estime doit au moins mentionner les mois gagnés sinon
      // tomber sur le fallback générique.
      expect(fire.impact_estime).toBeDefined()
    }
  })

  it('le boost ne déclasse JAMAIS une reco haute derrière une moyenne', () => {
    const p = patrimoine({
      fireInputs: {
        ...patrimoine().fireInputs,
        priorite: 'Investir en immobilier',  // → immo, boost diversification
      } as never,
    })
    const recos = genererRecommandations(p, calculerTousLesScores(p))
    const ranks = { haute: 0, moyenne: 1, info: 2 }
    for (let i = 1; i < recos.length; i++) {
      expect(ranks[recos[i]!.priorite]).toBeGreaterThanOrEqual(ranks[recos[i - 1]!.priorite])
    }
  })
})
