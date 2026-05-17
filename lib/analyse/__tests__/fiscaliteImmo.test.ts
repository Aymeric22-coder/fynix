import { describe, it, expect } from 'vitest'
import {
  calculerImpotFoncier,
  PRELEVEMENTS_SOCIAUX_PCT,
  SCI_IS_RATE_PCT,
  LMNP_AMORT_DEFAULT_PCT,
} from '../fiscaliteImmo'

describe('calculerImpotFoncier', () => {
  // Loyer 12 000 €/an, charges 2 000 €, intérêts 3 000 €, TMI 30 %.
  const baseInputs = {
    loyer_annuel:            12_000,
    charges_annuelles:       2_000,
    interets_credit_annuels: 3_000,
    tmi_rate:                30,
  }

  it('régime nul ou loyer nul → impôt = 0', () => {
    const r1 = calculerImpotFoncier({ ...baseInputs, fiscal_regime: null })
    expect(r1.impot_annuel).toBe(0)
    expect(r1.regime_applique).toBe('aucun')

    const r2 = calculerImpotFoncier({ ...baseInputs, loyer_annuel: 0, fiscal_regime: 'foncier_nu' })
    expect(r2.impot_annuel).toBe(0)
  })

  it('foncier_micro : abattement 30 %, base = loyer × 0,70, TMI + PS', () => {
    const r = calculerImpotFoncier({ ...baseInputs, fiscal_regime: 'foncier_micro' })
    // base = 12 000 × 0,70 = 8 400
    expect(r.base_imposable).toBe(8_400)
    // taux = 30 + 17,2 = 47,2 %
    expect(r.taux_effectif_pct).toBeCloseTo(47.2, 1)
    // impôt = 8 400 × 47,2 % = 3 964,8 → arrondi à 3 965
    expect(r.impot_annuel).toBe(3_965)
  })

  it('foncier_nu : base = loyer − charges − intérêts, TMI + PS', () => {
    const r = calculerImpotFoncier({ ...baseInputs, fiscal_regime: 'foncier_nu' })
    // base = 12 000 − 2 000 − 3 000 = 7 000
    expect(r.base_imposable).toBe(7_000)
    expect(r.taux_effectif_pct).toBeCloseTo(47.2, 1)
    // impôt = 7 000 × 47,2 % = 3 304
    expect(r.impot_annuel).toBe(3_304)
  })

  it('lmnp_micro : abattement 50 %, base = loyer × 0,50, TMI + PS', () => {
    const r = calculerImpotFoncier({ ...baseInputs, fiscal_regime: 'lmnp_micro' })
    // base = 12 000 × 0,50 = 6 000
    expect(r.base_imposable).toBe(6_000)
    // impôt = 6 000 × 47,2 % = 2 832
    expect(r.impot_annuel).toBe(2_832)
  })

  it('lmnp_reel sans amortissement : base = loyer − charges − intérêts, TMI seul', () => {
    const r = calculerImpotFoncier({ ...baseInputs, fiscal_regime: 'lmnp_reel' })
    expect(r.base_imposable).toBe(7_000)
    // TMI seul → pas de PS
    expect(r.taux_effectif_pct).toBeCloseTo(30, 1)
    // impôt = 7 000 × 30 % = 2 100
    expect(r.impot_annuel).toBe(2_100)
  })

  it('lmnp_reel AVEC amortissement : déduit aussi l\'amortissement du bâti', () => {
    // valeur amortissable 200 000 → amort = 200 000 × 2,5 % = 5 000
    const r = calculerImpotFoncier({
      ...baseInputs,
      fiscal_regime:        'lmnp_reel',
      valeur_amortissable:  200_000,
    })
    // base = 12 000 − 2 000 − 3 000 − 5 000 = 2 000
    expect(r.base_imposable).toBe(2_000)
    expect(r.impot_annuel).toBe(600)        // 2 000 × 30 %
  })

  it('sci_is : taux IS 25 % indépendant de la TMI', () => {
    const r = calculerImpotFoncier({
      ...baseInputs,
      fiscal_regime:       'sci_is',
      tmi_rate:            45,                 // TMI haute, doit être ignorée
      valeur_amortissable: 200_000,
    })
    // base = 12 000 − 2 000 − 3 000 − 5 000 = 2 000
    expect(r.base_imposable).toBe(2_000)
    expect(r.taux_effectif_pct).toBe(SCI_IS_RATE_PCT)
    expect(r.impot_annuel).toBe(500)        // 2 000 × 25 %
  })

  it('base négative (déficit foncier) → impôt = 0, pas d\'imputation', () => {
    const r = calculerImpotFoncier({
      ...baseInputs,
      loyer_annuel:            5_000,
      charges_annuelles:       4_000,
      interets_credit_annuels: 4_000,
      fiscal_regime:           'foncier_nu',
    })
    // base = 5 000 − 4 000 − 4 000 = -3 000
    expect(r.base_imposable).toBe(-3_000)
    expect(r.impot_annuel).toBe(0)
  })

  it('tmi_rate null → défaut 30 %', () => {
    const r = calculerImpotFoncier({ ...baseInputs, tmi_rate: null, fiscal_regime: 'foncier_nu' })
    expect(r.taux_effectif_pct).toBeCloseTo(30 + PRELEVEMENTS_SOCIAUX_PCT, 1)
  })

  it('constantes exposées', () => {
    expect(PRELEVEMENTS_SOCIAUX_PCT).toBe(17.2)
    expect(LMNP_AMORT_DEFAULT_PCT).toBe(2.5)
  })
})
