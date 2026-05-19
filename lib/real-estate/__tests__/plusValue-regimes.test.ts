/**
 * Tests des 4 régimes fiscaux supportés par calculerPlusValue.
 * Suit les tests 1-12 du brief de refonte « simulateur revente — multi-régimes ».
 *
 * Note : les calculs de référence du brief assument certains arrondis ;
 * on utilise `toBeCloseTo` ou des fourchettes pour absorber les arrondis
 * intermédiaires (toLocaleString, Math.round) tout en vérifiant la
 * cohérence métier.
 */
import { describe, it, expect } from 'vitest'
import {
  calculerPlusValue,
  calculerComparaisonRegimes,
  mapFiscalRegimeToRevente,
  type SimulationReventeInput,
} from '../plusValue'

function mkInput(over: Partial<SimulationReventeInput> = {}): SimulationReventeInput {
  return {
    prixAchat:          200_000,
    dateAchat:          new Date(Date.UTC(2013, 5, 1)),
    prixVenteEstime:    300_000,
    dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
    typeUsage:          'locatif',
    regimeFiscal:       'particulier',
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST 1 — Résidence principale tous régimes
// ─────────────────────────────────────────────────────────────────

describe('TEST 1 — Résidence principale (tous régimes)', () => {
  const regimes = ['particulier', 'lmnp', 'lmp', 'sci_is'] as const
  for (const regime of regimes) {
    it(`${regime} + RP → exonere=true, impotTotal=0`, () => {
      const r = calculerPlusValue(mkInput({
        typeUsage: 'residence_principale',
        regimeFiscal: regime,
      }))
      expect(r.exonere).toBe(true)
      expect(r.impotTotal).toBe(0)
      expect(r.regime).toBe(regime)
    })
  }
})

// ─────────────────────────────────────────────────────────────────
// TEST 2 — Particulier, 3 ans, PV brute 35 000 €
// ─────────────────────────────────────────────────────────────────

describe('TEST 2 — Particulier, 3 ans, PV 35 000 €', () => {
  it('Total impôt = 12 670 € (IR 6 650 + PS 6 020, surtaxe 0)', () => {
    const r = calculerPlusValue({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2020, 2, 15)),
      prixVenteEstime:    250_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 2, 15)),
      typeUsage:          'locatif',
      regimeFiscal:       'particulier',
    })
    expect(r.exonere).toBe(false)
    expect(r.anneesDetention).toBe(3)
    expect(r.fraisAcquisitionRetenus).toBe(15_000) // 7,5 % de 200k
    expect(r.travauxRetenus).toBe(0) // détention < 5 ans
    expect(r.prixAcquisitionCorriges).toBe(215_000)
    expect(r.pvBrute).toBe(35_000)
    expect(r.abattementIRPct).toBe(0)
    expect(r.abattementPSPct).toBe(0)
    expect(r.impotIR).toBe(6_650)
    expect(r.impotPS).toBe(6_020)
    expect(r.surtaxe).toBe(0)
    expect(r.impotTotal).toBe(12_670)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 3 — LMNP réel, 10 ans, amortissements réintégrés
// ─────────────────────────────────────────────────────────────────

describe('TEST 3 — LMNP 10 ans, amortissements 50 000 € réintégrés', () => {
  it('PV brute ≈ 105 000 €, total ≈ 32 000 € (avec abattements 10 ans)', () => {
    const r = calculerPlusValue({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
      regimeFiscal:       'lmnp',
      amortissementsCumules: 50_000,
    })
    expect(r.anneesDetention).toBe(10)
    expect(r.fraisAcquisitionRetenus).toBe(15_000) // 7,5 % de 200k
    expect(r.travauxRetenus).toBe(30_000) // 15 % forfait (détention > 5 ans)
    // baseCorrigee = 200 + 15 + 30 = 245k ; VNC = 245 - 50 = 195k ; PV = 105k
    expect(r.vnc).toBe(195_000)
    expect(r.pvBrute).toBe(105_000)
    expect(r.abattementIRPct).toBe(30)              // (10 - 5) × 6 %
    expect(r.abattementPSPct).toBeCloseTo(8.25, 2)  // (10 - 5) × 1,65 %
    // Tolérance ±200 € pour les arrondis
    expect(r.impotTotal).toBeGreaterThan(31_500)
    expect(r.impotTotal).toBeLessThan(32_500)
    expect(r.amortissementsCumulesUtilises).toBe(50_000)
    expect(r.amortissementsEstimes).toBe(false)
    // Vérifier qu'un avertissement LF 2025 est présent
    expect(r.avertissements.some((a) => /finances 2025|amortissements/i.test(a))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 4 — SCI IS, 10 ans, amortissements 50 000 €
// ─────────────────────────────────────────────────────────────────

describe('TEST 4 — SCI IS, 10 ans, amortissements 50 000 €', () => {
  it('PV IS 150 000 €, IS 37 500 €, Net SCI 262 500 €, dividendes 183 750 €', () => {
    const r = calculerPlusValue({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
      regimeFiscal:       'sci_is',
      amortissementsCumules: 50_000,
      fraisAgenceVente:   0,
    })
    expect(r.sciIsDetail).toBeDefined()
    const d = r.sciIsDetail!
    expect(r.vnc).toBe(150_000)            // 200k - 50k
    expect(r.pvImposable).toBe(150_000)    // 300k - 150k
    expect(r.impotIR).toBe(37_500)          // IS 25 %
    expect(d.netApresIS).toBe(262_500)
    expect(d.netApresDistributionDividendes).toBe(183_750) // 262 500 × 0,7
    expect(d.montantCCARemboursable).toBe(0)               // pas de CCA
    // Sans CCA → netVendeur = dividendes
    expect(r.netVendeur).toBe(183_750)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 5 — SCI IS avec CCA 80 000 €
// ─────────────────────────────────────────────────────────────────

describe('TEST 5 — SCI IS avec CCA 80 000 € — scénario optimisé', () => {
  it('CCA remboursé sans impôt + PFU sur solde → net 207 750 €', () => {
    const r = calculerPlusValue({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
      regimeFiscal:       'sci_is',
      amortissementsCumules:    50_000,
      comptesCourantsAssocies:  80_000,
      fraisAgenceVente:         0,
    })
    const d = r.sciIsDetail!
    expect(d.netApresIS).toBe(262_500)
    expect(d.montantCCARemboursable).toBe(80_000)
    // Solde = 262 500 - 80 000 = 182 500 ; PFU 30 % = 54 750 ;
    // Net = 80 000 + 182 500 × 0,70 = 80 000 + 127 750 = 207 750
    expect(d.netApresRemboursementCCA).toBe(207_750)
    expect(r.netVendeur).toBe(207_750)
    // Le scénario CCA doit être MEILLEUR que dividendes seuls
    expect(d.netApresRemboursementCCA).toBeGreaterThan(d.netApresDistributionDividendes)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 6 — LMP, 5 ans, amortissements 25 000 €, TMI 30 %
// ─────────────────────────────────────────────────────────────────

describe('TEST 6 — LMP, 5 ans, amortissements 25 000 €, TMI 30 %', () => {
  it('PV CT 25k taxée TMI+PS, PV LT 50k taxée 12,8 % — total 18 200 €', () => {
    const r = calculerPlusValue({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2018, 5, 1)),
      prixVenteEstime:    250_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
      regimeFiscal:       'lmp',
      amortissementsCumules: 25_000,
      tmiLmp:             30,
      caLmpMoyenSur2Ans:  200_000, // au-dessus du plafond exo
    })
    expect(r.anneesDetention).toBe(5)
    expect(r.vnc).toBe(175_000) // 200 - 25
    expect(r.lmpDetail).toBeDefined()
    const d = r.lmpDetail!
    expect(d.pvCourtTerme).toBe(25_000)
    expect(d.pvLongTerme).toBe(50_000)
    expect(d.impotCourtTerme).toBe(7_500)            // 25k × 30 %
    expect(d.cotisationsSocialesLMP).toBe(4_300)     // 25k × 17,2 %
    expect(d.impotLongTerme).toBe(6_400)             // 50k × 12,8 %
    expect(r.impotTotal).toBe(18_200)
    expect(d.exonerationApplicable).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 7 — LMP exonération totale (CA 60 000 €)
// ─────────────────────────────────────────────────────────────────

describe('TEST 7 — LMP exonération totale (CA < 90 000 €)', () => {
  it('CA 60 000 € → exonere=true, impotTotal=0', () => {
    const r = calculerPlusValue({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2018, 5, 1)),
      prixVenteEstime:    250_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
      regimeFiscal:       'lmp',
      amortissementsCumules: 25_000,
      caLmpMoyenSur2Ans:  60_000,
    })
    expect(r.exonere).toBe(true)
    expect(r.impotTotal).toBe(0)
    expect(r.lmpDetail?.exonerationApplicable).toBe(true)
    expect(r.lmpDetail?.tauxExonerationPct).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 8 — LMNP vs Particulier (PV LMNP > PV Particulier)
// ─────────────────────────────────────────────────────────────────

describe('TEST 8 — LMNP vs Particulier (amortissements réintégrés)', () => {
  it('Mêmes inputs : PV imposable LMNP > PV imposable particulier', () => {
    const base = {
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif' as const,
    }
    const part = calculerPlusValue({ ...base, regimeFiscal: 'particulier' })
    const lmnp = calculerPlusValue({ ...base, regimeFiscal: 'lmnp', amortissementsCumules: 50_000 })
    // PV particulier = 300 - 245 = 55k vs PV LMNP = 300 - 195 = 105k
    expect(lmnp.pvBrute).toBeGreaterThan(part.pvBrute)
    expect(lmnp.impotTotal).toBeGreaterThan(part.impotTotal)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 9 — Moins-value
// ─────────────────────────────────────────────────────────────────

describe('TEST 9 — Moins-value (vente < acquisition corrigée)', () => {
  it('Particulier → exonere=true, impotTotal=0', () => {
    const r = calculerPlusValue(mkInput({
      prixVenteEstime: 180_000,
      regimeFiscal:    'particulier',
    }))
    expect(r.exonere).toBe(true)
    expect(r.impotTotal).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 10 — PV brute ≤ 15 000 €
// ─────────────────────────────────────────────────────────────────

describe('TEST 10 — PV brute ≤ 15 000 €', () => {
  it('exonere=true, raison contient "15 000"', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2020, 2, 15)),
      prixVenteEstime:    220_000, // après forfaits = PV brute ~5k
      dateCessionEstimee: new Date(Date.UTC(2023, 2, 15)),
    }))
    expect(r.exonere).toBe(true)
    // Espace insécable possible dans le toLocaleString
    expect(r.raisonExoneration).toMatch(/15[\s  ]?000/)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 11 — Détention 22 ans révolus : exo IR, PS non nulle
// ─────────────────────────────────────────────────────────────────

describe('TEST 11 — 22 ans révolus → IR exonéré, PS toujours dû', () => {
  it('abattementIRPct = 100, impotIR = 0, impotPS > 0', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          150_000,
      dateAchat:          new Date(Date.UTC(2001, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      regimeFiscal:       'particulier',
    }))
    expect(r.anneesDetention).toBe(22)
    expect(r.abattementIRPct).toBe(100)
    expect(r.impotIR).toBe(0)
    expect(r.abattementPSPct).toBeCloseTo(28, 2)
    expect(r.impotPS).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// TEST 12 — Comparaison inter-régimes
// ─────────────────────────────────────────────────────────────────

describe('TEST 12 — Comparaison inter-régimes', () => {
  it('Retourne 4 entrées triées par netVendeur décroissant', () => {
    const liste = calculerComparaisonRegimes(mkInput({
      prixAchat:          200_000,
      prixVenteEstime:    300_000,
      regimeFiscal:       'lmnp',
      amortissementsCumules: 50_000,
      caLmpMoyenSur2Ans:   200_000,
      tmiLmp:              30,
    }))
    expect(liste).toHaveLength(4)
    const regimes = liste.map((l) => l.regime).sort()
    expect(regimes).toEqual(['lmnp', 'lmp', 'particulier', 'sci_is'])
    // Tri décroissant
    for (let i = 1; i < liste.length; i++) {
      expect(liste[i - 1]!.netVendeur).toBeGreaterThanOrEqual(liste[i]!.netVendeur)
    }
    // Le régime actuel est marqué
    const actuel = liste.find((l) => l.regime === 'lmnp')
    expect(actuel?.estRegimeActuel).toBe(true)
  })

  it('comparaisonRegimes est exposée sur le résultat principal', () => {
    const r = calculerPlusValue(mkInput({
      regimeFiscal: 'particulier',
    }))
    expect(r.comparaisonRegimes).toBeDefined()
    expect(r.comparaisonRegimes!.length).toBe(4)
  })
})

// ─────────────────────────────────────────────────────────────────
// Helpers supplémentaires
// ─────────────────────────────────────────────────────────────────

describe('mapFiscalRegimeToRevente — mapping DB → revente', () => {
  it('lmnp_reel → lmnp', () => {
    expect(mapFiscalRegimeToRevente('lmnp_reel')).toBe('lmnp')
  })
  it('lmnp_micro → micro_bic', () => {
    expect(mapFiscalRegimeToRevente('lmnp_micro')).toBe('micro_bic')
  })
  it('sci_is → sci_is', () => {
    expect(mapFiscalRegimeToRevente('sci_is')).toBe('sci_is')
  })
  it('null / undefined / inconnu → particulier', () => {
    expect(mapFiscalRegimeToRevente(null)).toBe('particulier')
    expect(mapFiscalRegimeToRevente(undefined)).toBe('particulier')
    expect(mapFiscalRegimeToRevente('xxx')).toBe('particulier')
  })
})

describe('Amortissements estimés automatiquement', () => {
  it('LMNP sans amortissementsCumules → estimation 2,5 %/an × 85 %', () => {
    const r = calculerPlusValue(mkInput({
      regimeFiscal: 'lmnp',
    }))
    expect(r.amortissementsEstimes).toBe(true)
    // 10 ans × 2.5 % × 85 % × 200k = 42 500
    expect(r.amortissementsCumulesUtilises).toBeCloseTo(42_500, -2)
    expect(r.avertissements.some((a) => /estim/i.test(a))).toBe(true)
  })
})
