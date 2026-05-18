/**
 * Tests purs du calcul de plus-value immobilière.
 *
 * Chaque test couvre une règle métier identifiée du contexte du brief
 * (résidence principale, détention courte/longue, abattements palier,
 * surtaxe, exonération PV faible, impact FIRE, forfait vs réel).
 */
import { describe, it, expect } from 'vitest'
import {
  calculerPlusValue,
  abattementIRPct,
  abattementPSPct,
  anneesRevolues,
  calculerSurtaxe,
  TAUX_IR_PV_IMMO,
  type SimulationReventeInput,
} from '../plusValue'

function mkInput(over: Partial<SimulationReventeInput> = {}): SimulationReventeInput {
  return {
    prixAchat:          200_000,
    dateAchat:          new Date(Date.UTC(2020, 2, 15)),
    prixVenteEstime:    250_000,
    dateCessionEstimee: new Date(Date.UTC(2023, 2, 15)),
    typeUsage:          'locatif',
    ...over,
  }
}

describe('helpers — anneesRevolues / abattements / surtaxe', () => {
  it('anneesRevolues : 15 mars 2018 → 15 mars 2023 = 5 ans (anniversaire atteint)', () => {
    expect(anneesRevolues(
      new Date(Date.UTC(2018, 2, 15)),
      new Date(Date.UTC(2023, 2, 15)),
    )).toBe(5)
  })

  it('anneesRevolues : 15 mars 2018 → 14 mars 2023 = 4 ans (anniversaire pas encore)', () => {
    expect(anneesRevolues(
      new Date(Date.UTC(2018, 2, 15)),
      new Date(Date.UTC(2023, 2, 14)),
    )).toBe(4)
  })

  it('abattementIRPct paliers clés', () => {
    expect(abattementIRPct(0)).toBe(0)
    expect(abattementIRPct(5)).toBe(0)
    expect(abattementIRPct(6)).toBe(6)
    expect(abattementIRPct(10)).toBe(30)
    expect(abattementIRPct(21)).toBe(96)
    expect(abattementIRPct(22)).toBe(100)
    expect(abattementIRPct(25)).toBe(100)
  })

  it('abattementPSPct paliers clés', () => {
    expect(abattementPSPct(0)).toBe(0)
    expect(abattementPSPct(5)).toBe(0)
    expect(abattementPSPct(6)).toBeCloseTo(1.65, 2)
    expect(abattementPSPct(10)).toBeCloseTo(8.25, 2)
    expect(abattementPSPct(22)).toBeCloseTo(28, 2)
    expect(abattementPSPct(30)).toBe(100)
  })

  it('surtaxe : 0 si ≤ 50 000 €, 2 % palier 50-100k, 6 % au-delà 250k', () => {
    expect(calculerSurtaxe(40_000)).toBe(0)
    expect(calculerSurtaxe(50_000)).toBe(0)
    expect(calculerSurtaxe(80_000)).toBe(Math.round(80_000 * 0.02))
    expect(calculerSurtaxe(120_000)).toBe(Math.round(120_000 * 0.03))
    expect(calculerSurtaxe(300_000)).toBe(Math.round(300_000 * 0.06))
  })
})

describe('calculerPlusValue — exonérations', () => {
  // Test 1 — Résidence principale
  it('Test 1 — RP totalement exonérée (impotTotal = 0, exonere = true)', () => {
    const r = calculerPlusValue(mkInput({
      typeUsage:       'residence_principale',
      prixVenteEstime: 350_000,
    }))
    expect(r.exonere).toBe(true)
    expect(r.impotTotal).toBe(0)
    expect(r.raisonExoneration).toMatch(/résidence principale/i)
  })

  // Test 5 — PV brute ≤ 15 000 €
  it('Test 5 — PV brute ≤ 15 000 € exonérée', () => {
    // Prix achat 200k, frais forfait = 15 000 → acq corrigé = 215 000
    // Vente 220k → PV brute = 5 000 → exo
    const r = calculerPlusValue(mkInput({
      prixAchat:       200_000,
      prixVenteEstime: 220_000,
    }))
    expect(r.exonere).toBe(true)
    expect(r.pvBrute).toBeLessThanOrEqual(15_000)
    expect(r.impotTotal).toBe(0)
    // toLocaleString('fr-FR') utilise un espace insécable (  ou  )
    expect(r.raisonExoneration).toMatch(/15[\s  ]?000/)
  })

  it('1re cession hors RP avec vendeur sans RP depuis 4 ans → exonérée', () => {
    const r = calculerPlusValue(mkInput({
      prixVenteEstime:         300_000,
      estPremiereCessionHorsRP: true,
    }))
    expect(r.exonere).toBe(true)
    expect(r.impotTotal).toBe(0)
    expect(r.raisonExoneration).toMatch(/1re cession/i)
  })
})

describe('calculerPlusValue — détentions et impôts', () => {
  // Test 2 — Détention courte (3 ans, locatif)
  it('Test 2 — 3 ans, locatif, vente 250k, achat 200k → PV brute 35k, total ~12 670 €', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2020, 2, 15)),
      prixVenteEstime:    250_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 2, 15)),
      typeUsage:          'locatif',
    }))
    expect(r.exonere).toBe(false)
    expect(r.anneesDetention).toBe(3)
    expect(r.fraisAcquisitionRetenus).toBe(15_000) // 7,5 % de 200k
    expect(r.travauxRetenus).toBe(0) // détention < 5 ans
    expect(r.prixAcquisitionCorriges).toBe(215_000)
    expect(r.pvBrute).toBe(35_000)
    expect(r.abattementIRPct).toBe(0)
    expect(r.abattementPSPct).toBe(0)
    expect(r.impotIR).toBe(Math.round(35_000 * 0.19))   // 6 650
    expect(r.impotPS).toBe(Math.round(35_000 * 0.172))  // 6 020
    expect(r.surtaxe).toBe(0) // PV nette IR = 35k < 50k
    expect(r.impotTotal).toBe(6_650 + 6_020)            // 12 670
    expect(r.netVendeur).toBe(250_000 - 0 - 12_670)
  })

  // Test 3 — Détention longue (10 ans, locatif)
  it('Test 3 — 10 ans, locatif, vente 300k, achat 150k → PV brute 116 250 €, surtaxe 2 %', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          150_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
    }))
    expect(r.anneesDetention).toBe(10)
    // Frais 7,5 % de 150k = 11 250
    expect(r.fraisAcquisitionRetenus).toBe(11_250)
    // Travaux forfait 15 % de 150k = 22 500 (détention > 5 ans)
    expect(r.travauxRetenus).toBe(22_500)
    expect(r.prixAcquisitionCorriges).toBe(183_750)
    expect(r.pvBrute).toBe(116_250)
    // Abattements : IR 30 % (5 × 6), PS 8,25 % (5 × 1,65)
    expect(r.abattementIRPct).toBe(30)
    expect(r.abattementPSPct).toBeCloseTo(8.25, 2)
    // PV nettes
    expect(r.pvNettePourIR).toBeCloseTo(116_250 * 0.70, 2)  // 81 375
    expect(r.pvNettePourPS).toBeCloseTo(116_250 * 0.9175, 2) // 106 679
    // Impôts
    expect(r.impotIR).toBe(Math.round(116_250 * 0.70 * 0.19))   // ~15 461
    expect(r.impotPS).toBe(Math.round(116_250 * 0.9175 * 0.172)) // ~18 348
    // Surtaxe : PV nette IR ≈ 81 375 → palier 50-100k = 2 %
    expect(r.surtaxe).toBe(Math.round(116_250 * 0.70 * 0.02))    // ~1 628
    // Net vendeur > 0 et taux effectif raisonnable
    expect(r.netVendeur).toBeGreaterThan(250_000)
    expect(r.netVendeur).toBeLessThan(270_000)
    expect(r.tauxImpositionEffectifPct).toBeGreaterThan(25)
    expect(r.tauxImpositionEffectifPct).toBeLessThan(35)
  })

  // Test 4 — Détention 22 ans révolus → IR exonéré, PS non nul
  it('Test 4 — 22 ans → abattement IR 100 %, impotIR 0, impotPS non nul', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          150_000,
      dateAchat:          new Date(Date.UTC(2001, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      typeUsage:          'locatif',
    }))
    expect(r.anneesDetention).toBe(22)
    expect(r.abattementIRPct).toBe(100)
    expect(r.impotIR).toBe(0)
    // PS à 22 ans : 16 × 1,65 + 1,60 = 28 %
    expect(r.abattementPSPct).toBeCloseTo(28, 2)
    expect(r.impotPS).toBeGreaterThan(0)
    expect(r.surtaxe).toBe(0) // PV nette IR = 0 → pas de surtaxe
    expect(r.impotTotal).toBe(r.impotPS)
  })
})

describe('calculerPlusValue — forfait vs réel travaux', () => {
  // Test 7 — Forfait vs réel pour travaux
  it('Test 7a — travaux réels > 15 % → on prend les réels', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          150_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      travauxReels:       40_000, // > 22 500 (15 %)
      typeUsage:          'locatif',
    }))
    expect(r.travauxRetenus).toBe(40_000)
  })

  it('Test 7b — travaux réels < 15 % ET détention > 5 ans → forfait 15 %', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          150_000,
      dateAchat:          new Date(Date.UTC(2013, 5, 1)),
      prixVenteEstime:    300_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 5, 1)),
      travauxReels:       5_000, // < 22 500
      typeUsage:          'locatif',
    }))
    expect(r.travauxRetenus).toBe(22_500) // forfait
  })

  it('Test 7c — détention ≤ 5 ans → pas de forfait (on prend les réels même si < 15 %)', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2020, 2, 15)),
      prixVenteEstime:    280_000,
      dateCessionEstimee: new Date(Date.UTC(2023, 2, 15)), // 3 ans
      travauxReels:       8_000,
      typeUsage:          'locatif',
    }))
    expect(r.travauxRetenus).toBe(8_000) // pas de forfait pour 3 ans
  })

  it('Frais d\'acquisition réels > 0 → on prend les réels (pas le forfait)', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:             200_000,
      fraisAcquisitionReels: 20_000,
      typeUsage:             'locatif',
    }))
    expect(r.fraisAcquisitionRetenus).toBe(20_000)
  })
})

describe('calculerPlusValue — impact FIRE', () => {
  // Test 6 — Avec impact FIRE
  it('Test 6 — réinvestissement net abaisse l\'âge d\'indépendance', () => {
    const r = calculerPlusValue(mkInput({
      prixAchat:          200_000,
      dateAchat:          new Date(Date.UTC(2018, 0, 1)),
      prixVenteEstime:    320_000,
      dateCessionEstimee: new Date(Date.UTC(2028, 0, 1)), // 10 ans
      typeUsage:          'locatif',
      patrimoineActuel:   100_000,
      epargneMensuelle:   500,
      revenuMensuelNet:   2500,
      ageActuel:          35,
    }))
    expect(r.impactFIRE).toBeDefined()
    expect(r.impactFIRE!.gainPatrimoineNet).toBeGreaterThan(0)
    // Si les 2 âges sont calculés, le réinvestissement doit gagner ≥ 0 ans
    if (
      r.impactFIRE!.ageIndependanceSansVente !== null
      && r.impactFIRE!.nouvelAgeIndependance !== null
    ) {
      expect(r.impactFIRE!.nouvelAgeIndependance!)
        .toBeLessThanOrEqual(r.impactFIRE!.ageIndependanceSansVente!)
      expect(r.impactFIRE!.gainAnneesFIRE!).toBeGreaterThanOrEqual(0)
    }
  })

  it('Sans inputs FIRE → impactFIRE absent', () => {
    const r = calculerPlusValue(mkInput({
      prixVenteEstime: 280_000, // > acquisition corrigée pour avoir une PV
    }))
    expect(r.impactFIRE).toBeUndefined()
  })
})

describe('TAUX_IR_PV_IMMO constant', () => {
  it('reste à 19 % (taux légal fixe, ne doit pas dériver)', () => {
    expect(TAUX_IR_PV_IMMO).toBe(19)
  })
})
