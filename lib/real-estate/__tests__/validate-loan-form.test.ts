/**
 * V10.1 — Tests des helpers de validation de saisie crédit (ROB-101 / ROB-102).
 *
 * Validations PURES (pas de DOM, pas de React), partagées entre le wizard
 * de création (`app/(app)/immobilier/nouveau/page.tsx`) et le formulaire
 * crédit (`components/real-estate/credit-form.tsx`). Tests sur le contrat,
 * pas sur l'UI.
 */
import { describe, it, expect } from 'vitest'
import {
  validateLoanRates,
  validateLoanStartVsAcquisition,
  MAX_LOAN_RATE_PCT,
  MAX_INSURANCE_RATE_PCT,
} from '../validate-loan-form'

describe('V10.1 — validateLoanRates (ROB-102)', () => {
  it('null / undefined : rejette comme "requis"', () => {
    expect(validateLoanRates(null, 0)).toMatch(/requis/i)
    expect(validateLoanRates(undefined, 0)).toMatch(/requis/i)
  })

  it('taux nominal négatif : rejette comme "requis"', () => {
    expect(validateLoanRates(-0.1, 0)).toMatch(/requis/i)
  })

  it('taux nominal 0 % : autorisé (PTZ, prêt action logement)', () => {
    expect(validateLoanRates(0, 0)).toBeNull()
  })

  it('taux nominal dans la fourchette normale (3,5 %) : autorisé', () => {
    expect(validateLoanRates(3.5, 0.3)).toBeNull()
  })

  it('taux nominal === MAX_LOAN_RATE_PCT (20 %) : autorisé (borne incluse)', () => {
    expect(validateLoanRates(MAX_LOAN_RATE_PCT, 0)).toBeNull()
  })

  it('taux nominal > 20 % : rejeté avec message "entre 0 et 20"', () => {
    const msg = validateLoanRates(20.01, 0)
    expect(msg).toMatch(/entre 0 et 20/i)
  })

  it('taux nominal absurde (999 %) : rejeté', () => {
    expect(validateLoanRates(999, 0)).toMatch(/entre 0 et 20/i)
  })

  it("taux assurance null/undefined : autorisé (champ optionnel)", () => {
    expect(validateLoanRates(3.5, null)).toBeNull()
    expect(validateLoanRates(3.5, undefined)).toBeNull()
  })

  it('taux assurance dans la fourchette normale (0,3 %) : autorisé', () => {
    expect(validateLoanRates(3.5, 0.3)).toBeNull()
  })

  it('taux assurance MAX (3 %) : autorisé (cas risque aggravé / âgé)', () => {
    expect(validateLoanRates(3.5, MAX_INSURANCE_RATE_PCT)).toBeNull()
  })

  it('taux assurance > 3 % : rejeté avec message "entre 0 et 3"', () => {
    const msg = validateLoanRates(3.5, 3.01)
    expect(msg).toMatch(/entre 0 et 3/i)
  })

  it('taux assurance négatif : rejeté', () => {
    expect(validateLoanRates(3.5, -0.1)).toMatch(/entre 0 et 3/i)
  })

  it('priorité : taux nominal vérifié AVANT taux assurance', () => {
    // Les deux sont en faute : message du taux nominal en premier
    const msg = validateLoanRates(50, 10)
    expect(msg).toMatch(/nominal/i)
    expect(msg).not.toMatch(/assurance/i)
  })
})

describe('V10.1 — validateLoanStartVsAcquisition (ROB-101)', () => {
  it('deux dates valides, prêt après acquisition : autorisé', () => {
    expect(validateLoanStartVsAcquisition('2024-03-15', '2024-03-01')).toBeNull()
  })

  it('dates IDENTIQUES : autorisé (signature prêt = jour de l\'acquisition)', () => {
    expect(validateLoanStartVsAcquisition('2024-03-01', '2024-03-01')).toBeNull()
  })

  it('prêt avant acquisition (1 jour) : rejeté', () => {
    const msg = validateLoanStartVsAcquisition('2024-02-29', '2024-03-01')
    expect(msg).toMatch(/antérieure à la date d'acquisition/i)
  })

  it('prêt avant acquisition (5 ans) : rejeté', () => {
    const msg = validateLoanStartVsAcquisition('2019-01-01', '2024-01-01')
    expect(msg).toMatch(/antérieure à la date d'acquisition/i)
  })

  it('loan_start_date manquante : autorisé (validation séparée "date requise")', () => {
    expect(validateLoanStartVsAcquisition('', '2024-03-01')).toBeNull()
    expect(validateLoanStartVsAcquisition(null, '2024-03-01')).toBeNull()
    expect(validateLoanStartVsAcquisition(undefined, '2024-03-01')).toBeNull()
  })

  it("acquisition_date manquante : autorisé (n'a rien à comparer)", () => {
    expect(validateLoanStartVsAcquisition('2024-03-01', '')).toBeNull()
    expect(validateLoanStartVsAcquisition('2024-03-01', null)).toBeNull()
    expect(validateLoanStartVsAcquisition('2024-03-01', undefined)).toBeNull()
  })

  it('changement de mois autour du seuil', () => {
    // dernier jour du mois précédent vs premier du mois suivant
    expect(validateLoanStartVsAcquisition('2024-02-29', '2024-03-01')).toMatch(/antérieure/)
    expect(validateLoanStartVsAcquisition('2024-03-01', '2024-02-29')).toBeNull()
  })
})

describe('V10.1 — constantes exportées', () => {
  it('MAX_LOAN_RATE_PCT = 20', () => {
    expect(MAX_LOAN_RATE_PCT).toBe(20)
  })
  it('MAX_INSURANCE_RATE_PCT = 3 (ajusté après plan validé)', () => {
    expect(MAX_INSURANCE_RATE_PCT).toBe(3)
  })
})
