/**
 * Tests des fonctions pures du simulateur What-if (Tâche 3).
 */
import { describe, it, expect } from 'vitest'
import {
  simulerEpargneDelta, simulerNouvelleAcquisition, simulerChangementRendement,
} from '../whatif'
import { calculerCiblePatrimoine, swrPctFromFireType } from '../constants'
import { INFLATION_DEFAUT_PCT } from '../projectionFIRE'

// P1 — cible unifiée : (revenu × 12 / SWR) × (1 + inflation)^années.
// Pour la fixture `base` (3000 €/mois, 25 ans, SWR standard 4 %, inflation 2 %)
// ≈ 1 476 545 €, contre l'ancien × 25 figé = 900 000 €.
const CIBLE_BASE = calculerCiblePatrimoine(3_000, 25, INFLATION_DEFAUT_PCT, swrPctFromFireType(null))

// ─────────────────────────────────────────────────────────────────
// 1. simulerEpargneDelta
// ─────────────────────────────────────────────────────────────────

describe('simulerEpargneDelta', () => {
  const base = {
    patrimoineActuel:    200_000,
    epargneMensuelle:    1_000,
    rendementCentral:    7,        // 7 % annuel
    ageActuel:           30,
    ageCible:            55,
    revenuPassifCible:   3_000,    // cible capital P1 ≈ 1 476 545 € (cf. CIBLE_BASE)
    deltaEpargneMensuel: 0,
  }

  it('delta = 0 → age_avant === age_apres', () => {
    const r = simulerEpargneDelta(base)
    expect(r.cible_capital).toBe(CIBLE_BASE)
    expect(r.age_fire_avant).not.toBeNull()
    expect(r.age_fire_apres).toBe(r.age_fire_avant)
    expect(r.mois_gagnes).toBe(0)
  })

  it('+200 €/mois → mois_gagnes > 0', () => {
    const r = simulerEpargneDelta({ ...base, deltaEpargneMensuel: 200 })
    expect(r.mois_gagnes).not.toBeNull()
    expect(r.mois_gagnes!).toBeGreaterThan(0)
  })

  it('+1000 €/mois → plus de mois gagnes que +200 €/mois', () => {
    const r200  = simulerEpargneDelta({ ...base, deltaEpargneMensuel: 200 })
    const r1000 = simulerEpargneDelta({ ...base, deltaEpargneMensuel: 1000 })
    expect(r1000.mois_gagnes!).toBeGreaterThan(r200.mois_gagnes!)
  })

  it('delta négatif → mois_gagnes < 0 (FIRE plus tardif)', () => {
    const r = simulerEpargneDelta({ ...base, deltaEpargneMensuel: -500 })
    expect(r.mois_gagnes).not.toBeNull()
    expect(r.mois_gagnes!).toBeLessThan(0)
  })

  it('épargne = 0 et patrimoine sous la cible → age_fire null', () => {
    const r = simulerEpargneDelta({ ...base, epargneMensuelle: 0, deltaEpargneMensuel: 0 })
    expect(r.age_fire_avant).toBeNull()
    expect(r.mois_gagnes).toBeNull()  // ne peut pas comparer
  })

  it('patrimoine déjà au-dessus de la cible → age = ageActuel', () => {
    // > CIBLE_BASE (~1,48 M€) pour être déjà arrivé.
    const r = simulerEpargneDelta({ ...base, patrimoineActuel: 1_600_000 })
    expect(r.age_fire_avant).toBe(30)
    expect(r.mois_gagnes).toBe(0)
  })

  it('revenuPassifCible = 0 → cible_capital = 0, age = ageActuel', () => {
    const r = simulerEpargneDelta({ ...base, revenuPassifCible: 0 })
    expect(r.cible_capital).toBe(0)
    expect(r.age_fire_avant).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. simulerNouvelleAcquisition
// ─────────────────────────────────────────────────────────────────

describe('simulerNouvelleAcquisition', () => {
  const baseImmo = {
    patrimoineActuel:    300_000,
    epargneMensuelle:    1_000,
    rendementCentral:    7,
    ageActuel:           35,
    ageCible:            55,
    revenuPassifCible:   3_000,
    prix_bien:           200_000,
    loyer_mensuel:       900,
    charges_mensuelles:  150,
    apport:              40_000,
    taux_credit_pct:     3.5,
    duree_credit_ans:    20,
  }

  it('mensualité calculée correctement (160k à 3.5 % / 20 ans ≈ 928 €)', () => {
    const r = simulerNouvelleAcquisition(baseImmo)
    expect(r.mensualite_credit).toBeGreaterThan(900)
    expect(r.mensualite_credit).toBeLessThan(960)
  })

  it('cashflow négatif → impact_age_fire_mois ≤ 0 (FIRE retardé)', () => {
    // Avec loyer 900, charges 150, mensualité ~928 → cashflow ≈ −178 €
    const r = simulerNouvelleAcquisition(baseImmo)
    expect(r.impact_cashflow_mensuel).toBeLessThan(0)
    expect(r.impact_age_fire_mois).toBeLessThanOrEqual(0)
  })

  it('cashflow positif (loyer élevé) → impact_age_fire_mois > 0', () => {
    const r = simulerNouvelleAcquisition({ ...baseImmo, loyer_mensuel: 1500 })
    expect(r.impact_cashflow_mensuel).toBeGreaterThan(0)
    expect(r.impact_age_fire_mois!).toBeGreaterThan(0)
  })

  it('bien payé cash (apport = prix, pas de crédit) → mensualité = 0', () => {
    const r = simulerNouvelleAcquisition({
      ...baseImmo, apport: 200_000, prix_bien: 200_000,
    })
    expect(r.mensualite_credit).toBe(0)
    // Cashflow = loyer - charges
    expect(r.impact_cashflow_mensuel).toBe(900 - 150)
  })

  it('apport > prix → warning', () => {
    const r = simulerNouvelleAcquisition({ ...baseImmo, apport: 250_000 })
    expect(r.warning).toContain('Apport')
  })

  it('equity à 5 ans positive (appréciation 2 %/an + amortissement)', () => {
    const r = simulerNouvelleAcquisition(baseImmo)
    expect(r.impact_patrimoine_5ans).toBeGreaterThan(40_000)  // apport initial
  })

  it('taux à 0 % → mensualité = capital / nb_mois', () => {
    const r = simulerNouvelleAcquisition({
      ...baseImmo, taux_credit_pct: 0,
    })
    // (200k - 40k) / 240 mois = 666.66 €/mois
    expect(r.mensualite_credit).toBeCloseTo(666.67, 1)
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. simulerChangementRendement
// ─────────────────────────────────────────────────────────────────

describe('simulerChangementRendement', () => {
  const allocActuelle = [
    { label: 'Actions', pourcentage: 30, rendement_pct: 8 },
    { label: 'Cash',    pourcentage: 70, rendement_pct: 2 },
  ]
  const allocCible = [
    { label: 'Actions', pourcentage: 70, rendement_pct: 8 },
    { label: 'Cash',    pourcentage: 30, rendement_pct: 2 },
  ]

  it('rendement pondéré actuel = 30%×8 + 70%×2 = 3.8 %', () => {
    const r = simulerChangementRendement({
      patrimoineActuel: 100_000,
      allocationActuelle: allocActuelle,
      allocationCible:    allocCible,
    })
    expect(r.rendement_pondere_avant).toBe(3.8)
    expect(r.rendement_pondere_apres).toBe(6.2)  // 70×8 + 30×2 = 6.2
  })

  it('plus de rendement cible → patrimoine cible > patrimoine actuel à tous horizons', () => {
    const r = simulerChangementRendement({
      patrimoineActuel: 100_000,
      allocationActuelle: allocActuelle,
      allocationCible:    allocCible,
    })
    for (const pt of r.points) {
      expect(pt.apres).toBeGreaterThan(pt.avant)
      expect(pt.gain).toBeGreaterThan(0)
    }
  })

  it('allocations identiques → gain = 0', () => {
    const r = simulerChangementRendement({
      patrimoineActuel:   100_000,
      allocationActuelle: allocActuelle,
      allocationCible:    allocActuelle,
    })
    for (const pt of r.points) expect(pt.gain).toBe(0)
  })

  it('avec épargne mensuelle, projection > sans épargne', () => {
    const sansEpargne = simulerChangementRendement({
      patrimoineActuel:   100_000,
      allocationActuelle: allocActuelle,
      allocationCible:    allocCible,
    })
    const avecEpargne = simulerChangementRendement({
      patrimoineActuel:   100_000,
      allocationActuelle: allocActuelle,
      allocationCible:    allocCible,
      epargneMensuelle:   500,
    })
    expect(avecEpargne.points[0]!.apres).toBeGreaterThan(sansEpargne.points[0]!.apres)
  })

  it('horizons personnalisés respectés', () => {
    const r = simulerChangementRendement({
      patrimoineActuel:   100_000,
      allocationActuelle: allocActuelle,
      allocationCible:    allocCible,
      horizons:           [1, 3],
    })
    expect(r.points.map((p) => p.annees)).toEqual([1, 3])
  })

  it('rendement 0 % + épargne → patrimoine + cumul épargne', () => {
    const allocZero = [{ label: 'Cash', pourcentage: 100, rendement_pct: 0 }]
    const r = simulerChangementRendement({
      patrimoineActuel:   100_000,
      allocationActuelle: allocZero,
      allocationCible:    allocZero,
      epargneMensuelle:   500,
      horizons:           [1],
    })
    // 100k + 500 × 12 = 106k
    expect(r.points[0]!.apres).toBe(106_000)
  })
})
