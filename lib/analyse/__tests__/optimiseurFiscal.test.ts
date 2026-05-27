/**
 * Tests de l'optimiseur fiscal (Sprint 5).
 *
 * 8 opportunités évaluées avec gain chiffré en €.
 */
import { describe, it, expect } from 'vitest'
import { calculerOpportunitesFiscales } from '../optimiseurFiscal'
import type {
  PatrimoineComplet, EnrichedPosition, BienImmo, AnalyseAssetType,
} from '@/types/analyse'

// ─────────────────────────────────────────────────────────────────
// Fabriques (réutilise les patterns des autres tests analyse)
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

function bien(over: Partial<BienImmo> = {}): BienImmo {
  return {
    id: 'b1', nom: 'Appart', ville: 'Lyon', pays: 'France', type: 'Locatif',
    valeur: 200_000, loyer_mensuel: 800, credit_restant: 0,
    mensualite_credit: 0, charges_annuelles: 2_000,
    charges_are_estimated: false,
    equity: 200_000, rendement_brut: 4.8, rendement_net: 3.8,
    cashflow_mensuel: 633, cashflow_net_fiscal: 600,
    impot_mensuel_estime: 33, taux_effort_fiscal: 4,
    ltv: 0, niveau_levier: 'Sans crédit', risque_immo: 15,
    donnees_completes: true,
    taux_interet_estime: 3, duree_restante_mois: 0,
    ...over,
  }
}

function patrimoine(over: Partial<PatrimoineComplet> = {}): PatrimoineComplet {
  return {
    totalBrut: 200_000, totalNet: 180_000,
    totalPortefeuille: 100_000, totalImmo: 0, totalCash: 20_000, totalDettes: 0,
    totalImmoEquity: 0, risqueImmoGlobal: 30, revenuPassifImmo: 0,
    mensualitesImmoTotal: 0, rendementNetImmoMoyen: 0,
    positions: [], biens: [], comptes: [],
    repartitionClasses:     [],
    repartitionSectorielle: [],
    repartitionGeo:         [],
    scoreDiversificationSectorielle: 70,
    scoreDiversificationGeo:         70,
    rendementEstime: 5, revenuPassifActuel: 0,
    projectionFIRESnapshot: null,
    profilType: 'Équilibré', prenom: 'Test',
    fireInputs: {
      age: 35, age_cible: 60,
      epargne_mensuelle: 1000,
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
    lastUpdated: new Date().toISOString(),
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// Profil fiscal
// ─────────────────────────────────────────────────────────────────

describe('calculerOpportunitesFiscales — profil fiscal', () => {
  it('détecte les enveloppes ouvertes depuis fireInputs.enveloppes', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: { ...patrimoine().fireInputs, enveloppes: ['PEA', 'Assurance-vie'] },
      }),
    })
    expect(r.profil_fiscal.enveloppes_ouvertes).toContain('PEA')
    expect(r.profil_fiscal.enveloppes_ouvertes).toContain('Assurance-vie')
    expect(r.profil_fiscal.enveloppes_manquantes).toContain('PER')
    expect(r.profil_fiscal.enveloppes_manquantes).toContain('CTO')
  })

  it('calcule revenus fonciers depuis les biens locatifs', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        biens: [bien({ loyer_mensuel: 800 }), bien({ id: 'b2', loyer_mensuel: 1200 })],
      }),
    })
    // 800 × 12 + 1200 × 12 = 24 000
    expect(r.profil_fiscal.revenus_fonciers_annuels).toBe(24_000)
  })

  it('résidence principale (loyer 0) → pas comptée dans revenus fonciers', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        biens: [bien({ type: 'Résidence principale', loyer_mensuel: 0 })],
      }),
    })
    expect(r.profil_fiscal.revenus_fonciers_annuels).toBe(0)
  })

  it('capacité PER = 10 % revenus, plafonnée à 35 194 €', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: { ...patrimoine().fireInputs, revenu_mensuel_total: 5_000 },
      }),
    })
    // 5000 × 12 × 10 % = 6 000
    expect(r.profil_fiscal.capacite_per_annuelle).toBe(6_000)
  })

  it('capacité PER plafonnée à 35 194 € même avec revenus très élevés', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: { ...patrimoine().fireInputs, revenu_mensuel_total: 50_000 },
      }),
    })
    expect(r.profil_fiscal.capacite_per_annuelle).toBe(35_194)
  })
})

// ─────────────────────────────────────────────────────────────────
// OPP_1 — PEA
// ─────────────────────────────────────────────────────────────────

describe('OPP_1 — PEA', () => {
  it('PEA absent + 50 k€ actions/ETF → opportunité applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_pea')!
    expect(opp.applicable).toBe(true)
    expect(opp.gain_annuel_eur).toBeGreaterThan(0)
    expect(opp.titre).toContain('Ouvrir un PEA')
  })

  it('PEA absent + 2 k€ actions → pas applicable (seuil)', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 2_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_pea')!
    expect(opp.applicable).toBe(false)
    expect(opp.raison_non_applicable).toBeTruthy()
  })

  it('PEA ouvert + 50 k€ actions → titre "Optimiser votre PEA"', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
        fireInputs: { ...patrimoine().fireInputs, enveloppes: ['PEA'] },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_pea')!
    expect(opp.titre).toContain('Optimiser')
  })
})

// ─────────────────────────────────────────────────────────────────
// OPP_2 — PER
// ─────────────────────────────────────────────────────────────────

describe('OPP_2 — PER', () => {
  it('TMI 30 %, capacité 5 k€ → gain ≈ 1 500 €/an', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: {
          ...patrimoine().fireInputs, tmi_rate: 30,
          revenu_mensuel_total: 4_167,  // → capacité 5k€
        },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_per')!
    expect(opp.applicable).toBe(true)
    // Versement = min(5000, 10000) = 5000 → gain = 5000 × 30 % = 1500
    expect(opp.gain_annuel_eur).toBe(1_500)
    expect(opp.priorite).toBe(1)  // TMI ≥ 30 = priorité 1
  })

  it('TMI 11 % → priorité 2 (moins urgent)', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: { ...patrimoine().fireInputs, tmi_rate: 11 },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_per')!
    expect(opp.applicable).toBe(true)
    expect(opp.priorite).toBe(2)
  })

  it('TMI 0 % → non applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: { ...patrimoine().fireInputs, tmi_rate: 0 },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_per')!
    expect(opp.applicable).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// OPP_3 — Micro-foncier → réel
// ─────────────────────────────────────────────────────────────────

describe('OPP_3 — Micro-foncier vs réel', () => {
  it('bien micro avec charges 40 % des loyers → applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        biens: [bien({
          fiscal_regime: 'foncier_micro',
          loyer_mensuel: 1_000,     // 12 000 €/an
          charges_annuelles: 4_800, // 40 % des loyers
        })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_micro_foncier')!
    expect(opp.applicable).toBe(true)
    expect(opp.gain_annuel_eur).toBeGreaterThan(0)
  })

  it('bien micro avec charges 25 % des loyers → non applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        biens: [bien({
          fiscal_regime: 'foncier_micro',
          loyer_mensuel: 1_000,     // 12 000 €/an
          charges_annuelles: 3_000, // 25 % des loyers
        })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_micro_foncier')!
    expect(opp.applicable).toBe(false)
    expect(opp.raison_non_applicable).toContain('30 %')
  })

  it('aucun bien micro-foncier → non applicable avec raison', () => {
    const r = calculerOpportunitesFiscales({ patrimoine: patrimoine() })
    const opp = r.opportunites.find((o) => o.id === 'opp_micro_foncier')!
    expect(opp.applicable).toBe(false)
    expect(opp.raison_non_applicable).toContain('Aucun bien')
  })
})

// ─────────────────────────────────────────────────────────────────
// OPP_5 — Déficit foncier
// ─────────────────────────────────────────────────────────────────

describe('OPP_5 — Déficit foncier', () => {
  it('bien réel avec charges > loyers → applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        biens: [bien({
          fiscal_regime: 'foncier_nu',
          loyer_mensuel: 500,        // 6 000 €/an
          charges_annuelles: 10_000, // déficit 4 000 €
        })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_deficit_foncier')!
    expect(opp.applicable).toBe(true)
    expect(opp.gain_annuel_eur).toBeGreaterThan(0)
    expect(opp.priorite).toBe(1)
  })

  it('bien réel bénéficiaire (charges < loyers) → non applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        biens: [bien({
          fiscal_regime: 'foncier_nu',
          loyer_mensuel: 1_000,
          charges_annuelles: 2_000,
        })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_deficit_foncier')!
    expect(opp.applicable).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// OPP_7 — Optimisation cash
// ─────────────────────────────────────────────────────────────────

describe('OPP_7 — Cash optimization', () => {
  it('20 k€ sur compte courant → applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalCash: 25_000,
        comptes: [{
          id: 'cc1', nom: 'CC', type: 'compte_courant', banque: 'BNP',
          solde: 20_000, devise: 'EUR', taux_interet: 0,
        } as never],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_cash_optim')!
    expect(opp.applicable).toBe(true)
    expect(opp.gain_annuel_eur).toBeGreaterThan(500)
  })

  it('500 € sur CC → non applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalCash: 500,
        comptes: [{
          id: 'cc1', nom: 'CC', type: 'compte_courant', banque: null,
          solde: 500, devise: 'EUR', taux_interet: 0,
        } as never],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_cash_optim')!
    expect(opp.applicable).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// OPP_8 — Démembrement
// ─────────────────────────────────────────────────────────────────

describe('OPP_8 — Démembrement / transmission', () => {
  it('patrimoine > 500 k€ + 45+ ans + immo PP → applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalNet: 600_000,
        fireInputs: { ...patrimoine().fireInputs, age: 50 },
        biens: [bien({ equity: 300_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_demembrement')!
    expect(opp.applicable).toBe(true)
  })

  it('patrimoine 200 k€ → non applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalNet: 200_000,
        fireInputs: { ...patrimoine().fireInputs, age: 50 },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_demembrement')!
    expect(opp.applicable).toBe(false)
    expect(opp.raison_non_applicable).toContain('Patrimoine')
  })

  it('30 ans → non applicable même avec gros patrimoine', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalNet: 1_000_000,
        fireInputs: { ...patrimoine().fireInputs, age: 30 },
        biens: [bien({ equity: 500_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_demembrement')!
    expect(opp.applicable).toBe(false)
    expect(opp.raison_non_applicable).toContain('45')
  })
})

// ─────────────────────────────────────────────────────────────────
// Tri et agrégation
// ─────────────────────────────────────────────────────────────────

describe('Tri + agrégation', () => {
  it('applicables d\'abord, puis non applicables', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
        fireInputs: { ...patrimoine().fireInputs, tmi_rate: 30 },
      }),
    })
    const opps = r.opportunites
    // Trouve l'index du 1er non-applicable
    const firstNonApp = opps.findIndex((o) => !o.applicable)
    if (firstNonApp >= 0) {
      // Tous ceux qui suivent doivent aussi être non applicables
      for (let i = firstNonApp; i < opps.length; i++) {
        expect(opps[i]!.applicable).toBe(false)
      }
    }
  })

  it('à applicabilité égale, tri par priorité ASC', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
        fireInputs: { ...patrimoine().fireInputs, tmi_rate: 30 },
      }),
    })
    const apps = r.opportunites.filter((o) => o.applicable)
    for (let i = 1; i < apps.length; i++) {
      expect(apps[i]!.priorite).toBeGreaterThanOrEqual(apps[i - 1]!.priorite)
    }
  })

  it('gain_total_estime_annuel = somme des opps applicables', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
        fireInputs: { ...patrimoine().fireInputs, tmi_rate: 30 },
      }),
    })
    const somme = r.opportunites
      .filter((o) => o.applicable)
      .reduce((s, o) => s + o.gain_annuel_eur, 0)
    expect(r.gain_total_estime_annuel).toBe(somme)
  })

  it('gain_total_estime_5ans cohérent (≥ gain annuel)', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
        fireInputs: { ...patrimoine().fireInputs, tmi_rate: 30 },
      }),
    })
    if (r.gain_total_estime_annuel > 0) {
      expect(r.gain_total_estime_5ans).toBeGreaterThanOrEqual(r.gain_total_estime_annuel)
    }
  })

  it('toujours 8 opportunités exposées (applicables ou non)', () => {
    const r = calculerOpportunitesFiscales({ patrimoine: patrimoine() })
    expect(r.opportunites).toHaveLength(8)
  })
})

// ─────────────────────────────────────────────────────────────────
// D17 — Corrections audit calculs fiscaux
// ─────────────────────────────────────────────────────────────────

describe('D17a — PEA : gain réaliste (sans turnover fictif)', () => {
  it('PEA non ouvert + 50 k€ ETF en CTO → gain ≈ 50 000 × 7% × 12.8% (pas × 20% × 7%)', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 50_000 })],
        fireInputs: {
          ...patrimoine().fireInputs,
          enveloppes: [],   // pas de PEA
          tmi_rate: 30,
        },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_pea')!
    expect(opp.applicable).toBe(true)
    // Gain attendu : 50 000 × 0.07 = 3 500 PV/an + dividendes CTO
    // (dividendes = 50 000 × 1.0 × 0.02 = 1 000)
    // Base = 4 500 ; économie = 4 500 × (30 − 17.2) / 100 = 576 €
    // L'ancien calcul donnait : 50 000 × 0.20 × 0.07 = 700 PV/an → 89.6 € — beaucoup trop bas
    expect(opp.gain_annuel_eur).toBeGreaterThan(500)
    expect(opp.gain_annuel_eur).toBeLessThan(700)
  })

  it('PEA ouvert + 30 k€ ETF → gain basé sur dividendes seuls, pas sur turnover fictif', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        positions: [pos({ asset_type: 'etf', current_value: 30_000 })],
        fireInputs: {
          ...patrimoine().fireInputs,
          enveloppes: ['PEA'],
          tmi_rate: 30,
        },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_pea')!
    expect(opp.applicable).toBe(true)
    // peaOuvert → pvAnnuellesEstimees = 0, dividendes = 30 000 × 0.3 × 0.02 = 180
    // gain = 180 × 12.8 / 100 = 23 €
    expect(opp.gain_annuel_eur).toBeLessThan(50)
  })
})

describe('D17b — AV : gain sur abattement réalisable (pas PV latentes)', () => {
  it('AV ouverte + TMI 30 → gain = 4 600 × 30% = 1 380 €', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: {
          ...patrimoine().fireInputs,
          enveloppes: ['Assurance-vie'],
          tmi_rate: 30,
        },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_assurance_vie')!
    expect(opp.applicable).toBe(true)
    expect(opp.gain_annuel_eur).toBe(1_380)
  })

  it('AV non ouverte → gain = 0', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: {
          ...patrimoine().fireInputs,
          enveloppes: [],
          tmi_rate: 30,
        },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_assurance_vie')!
    expect(opp.applicable).toBe(false)
    expect(opp.gain_annuel_eur).toBe(0)
  })

  it('AV ouverte mais TMI 0 → non applicable', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        fireInputs: {
          ...patrimoine().fireInputs,
          enveloppes: ['Assurance-vie'],
          tmi_rate: 0,
        },
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_assurance_vie')!
    expect(opp.applicable).toBe(false)
    expect(opp.gain_annuel_eur).toBe(0)
  })
})

describe('D17c — Démembrement : barème progressif + abattement 100 k€', () => {
  it('immo PP 300 k€ + 55 ans (usufruit 50 %) → nue-prop 150 k€ − 100 k€ = 50 k€ base', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalNet: 600_000,
        fireInputs: { ...patrimoine().fireInputs, age: 55 },
        biens: [bien({ equity: 300_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_demembrement')!
    expect(opp.applicable).toBe(true)
    // age 55 → tauxUsufruit = 0.50 (61 > age ≥ 51)
    // nuePropTransmise = 0.50 × 300 000 = 150 000
    // base = 150 000 − 100 000 = 50 000
    // droits = 1 380.75 + (50 000 − 15 932) × 0.20 ≈ 8 194 €
    // gain_5ans = droits / 2 ≈ 4 097
    expect(opp.gain_5ans_eur).toBeGreaterThan(3_500)
    expect(opp.gain_5ans_eur).toBeLessThan(5_000)
  })

  it('immo PP 200 k€ + 55 ans (usufruit 50 %) → nue-prop 100 k€ = abattement → base 0', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalNet: 600_000,
        fireInputs: { ...patrimoine().fireInputs, age: 55 },
        biens: [bien({ equity: 200_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_demembrement')!
    // 200 000 × 50 % = 100 000 ; après abattement 100 000 → base = 0 → droits = 0
    expect(opp.applicable).toBe(true)
    expect(opp.gain_5ans_eur).toBe(0)
  })

  it('mention "abattement" dans les conditions affichées', () => {
    const r = calculerOpportunitesFiscales({
      patrimoine: patrimoine({
        totalNet: 600_000,
        fireInputs: { ...patrimoine().fireInputs, age: 50 },
        biens: [bien({ equity: 300_000 })],
      }),
    })
    const opp = r.opportunites.find((o) => o.id === 'opp_demembrement')!
    expect(opp.conditions.join(' ')).toMatch(/Abattement/i)
  })
})
