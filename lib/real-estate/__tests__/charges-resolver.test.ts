import { describe, it, expect } from 'vitest'
import { resolveCharges } from '../charges-resolver'

describe('resolveCharges — conversion € / %', () => {
  it('GLI 3,5 % et loyers 9 600 €/an → GLI résolue = 336 €', () => {
    const r = resolveCharges({ insurance_gli_pct: 3.5 }, 9_600)
    expect(r.gliResolvedEur).toBeCloseTo(336, 2)
    expect(r.assurancesTotal).toBeCloseTo(336, 2)
  })

  it('GLI fixe 400 €/an et pct = 0 → GLI résolue = 400', () => {
    const r = resolveCharges({ insurance_gli_eur: 400, insurance_gli_pct: 0 }, 9_600)
    expect(r.gliResolvedEur).toBe(400)
  })

  it('GLI : pct prévaut sur eur (les deux fournis)', () => {
    const r = resolveCharges(
      { insurance_gli_eur: 1_000, insurance_gli_pct: 3 }, 10_000,
    )
    // 10000 × 3 % = 300, pas 1000
    expect(r.gliResolvedEur).toBe(300)
  })

  it('frais agence 8 % loyers 12 000 → 960 €', () => {
    const r = resolveCharges({ management_agency_pct: 8 }, 12_000)
    expect(r.agencyFeesResolvedEur).toBe(960)
    expect(r.gestionTotal).toBe(960)
  })

  it('plateformes Airbnb + Booking en % sur loyers courte durée', () => {
    const r = resolveCharges(
      { management_airbnb_pct: 15, management_booking_pct: 18 }, 20_000,
    )
    // 15 % de 20k + 18 % de 20k = 3000 + 3600 = 6600
    expect(r.gestionTotal).toBeCloseTo(6_600, 2)
  })

  it('totaux par catégorie : sommes correctes', () => {
    const r = resolveCharges({
      taxe_fonciere: 1_500, taxe_habitation: 600, teom: 200,    // taxes = 2 300
      insurance: 400, insurance_mrh: 300,                       // assurances = 700 (+ 0 GLI)
      condo_fees: 800, condo_fees_works: 1_200, condo_special_fund: 100,  // copro = 2 100
      accountant: 500, cfe: 200, legal_fees: 150,               // pro = 850 (+ diag 0)
      maintenance: 300, maintenance_major: 1_000,               // travaux = 1 300
      utilities_internet: 240, utilities_water: 120,            // utilities = 360
      other: 50,
    }, 0)
    expect(r.taxesLocalesTotal).toBe(2_300)
    expect(r.assurancesTotal).toBe(700)
    expect(r.coproTotal).toBe(2_100)
    expect(r.professionalTotal).toBe(850)
    expect(r.travauxTotal).toBe(1_300)
    expect(r.utilitiesTotal).toBe(360)
    expect(r.otherTotal).toBe(50)
    expect(r.totalAnnualEur).toBe(7_660)
  })

  it('ligne vide ou null → tout à 0', () => {
    expect(resolveCharges(null, 0).totalAnnualEur).toBe(0)
    expect(resolveCharges({}, 10_000).totalAnnualEur).toBe(0)
  })

  it('valeurs négatives en base → ramenées à 0 (sécurité)', () => {
    const r = resolveCharges({ taxe_fonciere: -100, insurance: -50 }, 0)
    expect(r.taxesLocalesTotal).toBe(0)
    expect(r.assurancesTotal).toBe(0)
  })
})
