/**
 * V12 — Tests des helpers du wizard (CAS-RP-001 / CAS-WIZ-LOT-001).
 *
 * Sémantique partagée wizard + page fiche : un bien `primary_residence` ou
 * `secondary_residence` n'a ni régime fiscal locatif, ni lots locatifs.
 */
import { describe, it, expect } from 'vitest'
import {
  isRentalWizardUsage,
  wizardStepsFor,
  requiresFiscalRegimeStep,
  STEPS_RENTAL,
  STEPS_NON_RENTAL,
} from '../validate-wizard'

describe('V12 — isRentalWizardUsage', () => {
  it('long_term_rental : true', () => {
    expect(isRentalWizardUsage('long_term_rental')).toBe(true)
  })
  it('short_term_rental : true', () => {
    expect(isRentalWizardUsage('short_term_rental')).toBe(true)
  })
  it('mixed_use : true', () => {
    expect(isRentalWizardUsage('mixed_use')).toBe(true)
  })
  it('primary_residence : false', () => {
    expect(isRentalWizardUsage('primary_residence')).toBe(false)
  })
  it('secondary_residence : false', () => {
    expect(isRentalWizardUsage('secondary_residence')).toBe(false)
  })
  it('null / undefined / chaîne inconnue : false (fallback prudent)', () => {
    expect(isRentalWizardUsage(null)).toBe(false)
    expect(isRentalWizardUsage(undefined)).toBe(false)
    expect(isRentalWizardUsage('')).toBe(false)
    expect(isRentalWizardUsage('foo')).toBe(false)
  })
})

describe('V12 — wizardStepsFor', () => {
  it('locatif (long/short/mixed) : 5 étapes', () => {
    expect(wizardStepsFor('long_term_rental')).toHaveLength(5)
    expect(wizardStepsFor('short_term_rental')).toHaveLength(5)
    expect(wizardStepsFor('mixed_use')).toHaveLength(5)
  })

  it('locatif : la 5e étape est « Lots & loyers » optionnelle', () => {
    const steps = wizardStepsFor('long_term_rental')
    expect(steps[4]).toMatchObject({ id: '5', label: 'Lots & loyers', optional: true })
  })

  it('locatif : la 4e étape est « Régime fiscal » obligatoire', () => {
    const steps = wizardStepsFor('long_term_rental')
    expect(steps[3]!.label).toBe('Régime fiscal')
    expect(steps[3]!.optional).toBeUndefined()
  })

  it('non-locatif (RP/RS) : 4 étapes', () => {
    expect(wizardStepsFor('primary_residence')).toHaveLength(4)
    expect(wizardStepsFor('secondary_residence')).toHaveLength(4)
  })

  it('non-locatif : la 4e étape est « Récapitulatif » (remplace Régime + Lots)', () => {
    const steps = wizardStepsFor('primary_residence')
    expect(steps[3]!.label).toBe('Récapitulatif')
    // pas optionnelle (c'est l'écran final, pas un step "facultatif")
    expect(steps[3]!.optional).toBeUndefined()
  })

  it('non-locatif : pas d\'étape « Lots & loyers »', () => {
    const steps = wizardStepsFor('primary_residence')
    expect(steps.find(s => s.label === 'Lots & loyers')).toBeUndefined()
  })

  it('usage_type inconnu : fallback non-locatif (4 étapes, pas de fiscal forcé)', () => {
    expect(wizardStepsFor(null)).toBe(STEPS_NON_RENTAL)
    expect(wizardStepsFor('')).toBe(STEPS_NON_RENTAL)
    expect(wizardStepsFor('foo')).toBe(STEPS_NON_RENTAL)
  })

  it('cohérence : STEPS_RENTAL et STEPS_NON_RENTAL partagent les 3 premières étapes', () => {
    for (let i = 0; i < 3; i++) {
      expect(STEPS_RENTAL[i]!.id).toBe(STEPS_NON_RENTAL[i]!.id)
      expect(STEPS_RENTAL[i]!.label).toBe(STEPS_NON_RENTAL[i]!.label)
    }
  })
})

describe('V12 — requiresFiscalRegimeStep', () => {
  it('locatif : true', () => {
    expect(requiresFiscalRegimeStep('long_term_rental')).toBe(true)
    expect(requiresFiscalRegimeStep('short_term_rental')).toBe(true)
    expect(requiresFiscalRegimeStep('mixed_use')).toBe(true)
  })
  it('non-locatif (RP/RS) : false — pas de validation du régime', () => {
    expect(requiresFiscalRegimeStep('primary_residence')).toBe(false)
    expect(requiresFiscalRegimeStep('secondary_residence')).toBe(false)
  })
  it('null / undefined : false (prudent)', () => {
    expect(requiresFiscalRegimeStep(null)).toBe(false)
    expect(requiresFiscalRegimeStep(undefined)).toBe(false)
  })
})
