import { describe, it, expect } from 'vitest'
import { resolveCharges, type RawChargesRow } from '../charges-resolver'

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

// ─────────────────────────────────────────────────────────────────────
// V6 — opts.excludeShortTermPlatformFees (BUG-001 : double comptage des
// commissions courte durée).
//
// Pour un lot short_term/mixed, `computeMonthlyRentForLot` retourne déjà
// `netOwnerRevenueTotal / 12` (net des commissions plateformes + frais
// opérationnels). Si l'utilisateur saisit aussi ces 4 postes dans
// `property_charges`, on les déduirait 2 fois (~12 k€/an d'écart pour
// un Airbnb à 50 k€). L'option zéro ces 4 postes pour casser le doublon.
// ─────────────────────────────────────────────────────────────────────

const ANNUAL_RENT_FULL = 30_000  // base pour les % → €

// Fixture représentative : tous les postes susceptibles d'être affectés
// par le mode strip + ceux qui doivent rester intacts (vérification non-
// régression).
const FULL_CHARGES_ST: RawChargesRow = {
  taxe_fonciere:           1_500,
  taxe_habitation:         600,
  teom:                    180,
  insurance:               350,        // PNO
  insurance_mrh:           250,
  condo_fees:              900,
  condo_fees_works:        300,
  condo_special_fund:      200,
  // `management_agency_pct` = gestion locative classique (mandat long
  // terme), distincte des commissions plateformes. NON affectée par strip.
  management_agency_pct:   5,          // → 30 000 × 5 % = 1 500 €/an
  // 4 postes courte durée (AFFECTÉS par strip) :
  management_airbnb_pct:   15,         // → 4 500 €/an
  management_booking_pct:  12,         // → 3 600 €/an
  management_cleaning:     2_400,      // 200 €/mois
  management_concierge:    1_800,      // 150 €/mois
  // Autres catégories (non affectées)
  maintenance:             500,
  maintenance_major:       800,
  repairs_provision:       400,
  accountant:              300,
  cfe:                     150,
  legal_fees:              100,
  diagnostics_fees:        80,
  utilities_internet:      480,
  utilities_electricity:   600,
  utilities_water:         240,
  other:                   200,
}

describe('V6 — excludeShortTermPlatformFees (BUG-001)', () => {

  it('sans opts → tous les frais plateformes comptés (rétro-compat)', () => {
    const r = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL)
    // gestionTotal = agency 1 500 + airbnb 4 500 + booking 3 600
    //              + cleaning 2 400 + concierge 1 800 = 13 800
    expect(r.gestionTotal).toBe(13_800)
    expect(r.agencyFeesResolvedEur).toBe(1_500)
  })

  it('opts vide {} → identique au comportement par défaut', () => {
    const rDefault = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL)
    const rEmpty   = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL, {})
    expect(rEmpty.totalAnnualEur).toBe(rDefault.totalAnnualEur)
  })

  it('strip = true → airbnb + booking + cleaning + concierge zéroés', () => {
    const r = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL, {
      excludeShortTermPlatformFees: true,
    })
    // gestionTotal = SEULEMENT agency 1 500 (les 4 plateformes zéroés)
    expect(r.gestionTotal).toBe(1_500)
  })

  it('strip = true → management_agency_pct PRÉSERVÉ (mandat long terme)', () => {
    // Un bien short-term peut avoir aussi un mandat de gestion local
    // (= gestion locative classique, distincte des plateformes).
    const r = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL, {
      excludeShortTermPlatformFees: true,
    })
    expect(r.agencyFeesResolvedEur).toBe(1_500)
  })

  it('strip = true → autres catégories INCHANGÉES + écart = 4 postes ciblés', () => {
    const rDefault = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL)
    const rStrip   = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL, {
      excludeShortTermPlatformFees: true,
    })

    expect(rStrip.taxesLocalesTotal ).toBe(rDefault.taxesLocalesTotal)
    expect(rStrip.assurancesTotal   ).toBe(rDefault.assurancesTotal)
    expect(rStrip.coproTotal        ).toBe(rDefault.coproTotal)
    expect(rStrip.travauxTotal      ).toBe(rDefault.travauxTotal)
    expect(rStrip.professionalTotal ).toBe(rDefault.professionalTotal)
    expect(rStrip.utilitiesTotal    ).toBe(rDefault.utilitiesTotal)
    expect(rStrip.otherTotal        ).toBe(rDefault.otherTotal)
    expect(rStrip.gliResolvedEur    ).toBe(rDefault.gliResolvedEur)

    // L'écart total = exactement la somme des 4 postes ciblés (12 300 €).
    const expectedDelta = 4_500 + 3_600 + 2_400 + 1_800
    expect(rDefault.totalAnnualEur - rStrip.totalAnnualEur).toBe(expectedDelta)
  })

  it('strip = true sur charges null → 0 partout (no crash)', () => {
    const r = resolveCharges(null, ANNUAL_RENT_FULL, {
      excludeShortTermPlatformFees: true,
    })
    expect(r.totalAnnualEur).toBe(0)
    expect(r.gestionTotal  ).toBe(0)
  })

  it('strip = false explicite → identique au défaut', () => {
    const r        = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL, {
      excludeShortTermPlatformFees: false,
    })
    const rDefault = resolveCharges(FULL_CHARGES_ST, ANNUAL_RENT_FULL)
    expect(r.totalAnnualEur).toBe(rDefault.totalAnnualEur)
  })
})
