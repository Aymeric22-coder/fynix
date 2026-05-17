import { describe, it, expect } from 'vitest'
import {
  normalizeFiscalRegime, fiscalRegimeLabel, isRegime,
  detecterRegimeFiscal,
  PLAFOND_MICRO_FONCIER, PLAFOND_MICRO_BIC, TMI_SEUIL_REEL_PCT,
} from '../regimeFiscalImmo'

describe('normalizeFiscalRegime', () => {
  it('normalise les valeurs d\'enum DB', () => {
    expect(normalizeFiscalRegime('lmnp_reel')).toBe('lmnp_reel')
    expect(normalizeFiscalRegime('foncier_nu')).toBe('foncier_nu')
    expect(normalizeFiscalRegime('sci_is')).toBe('sci_is')
  })

  it('case-insensitive + trim', () => {
    expect(normalizeFiscalRegime('  LMP  ')).toBe('lmp')
    expect(normalizeFiscalRegime('SCI_IR')).toBe('sci_ir')
  })

  it('alias historiques', () => {
    expect(normalizeFiscalRegime('foncier_reel')).toBe('foncier_nu')
    expect(normalizeFiscalRegime('rental')).toBe('foncier_nu')
    expect(normalizeFiscalRegime('primary')).toBe('rp')
  })

  it('match partiel (suffixe d\'annee)', () => {
    expect(normalizeFiscalRegime('lmnp_reel_2024')).toBe('lmnp_reel')
  })

  it('valeurs vides ou inconnues retournent null', () => {
    expect(normalizeFiscalRegime('')).toBeNull()
    expect(normalizeFiscalRegime(null)).toBeNull()
    expect(normalizeFiscalRegime('garbage')).toBeNull()
  })
})

describe('fiscalRegimeLabel', () => {
  it('libelles FR coherents', () => {
    expect(fiscalRegimeLabel('lmnp_reel')).toBe('LMNP réel')
    expect(fiscalRegimeLabel('rp')).toBe('Résidence principale')
    expect(fiscalRegimeLabel(null)).toBe('Non renseigné')
  })
})

describe('isRegime', () => {
  it('match contre une liste de regimes', () => {
    expect(isRegime({ fiscal_regime: 'lmnp_reel' }, ['lmnp_reel', 'lmp'])).toBe(true)
    expect(isRegime({ fiscal_regime: 'foncier_nu' }, ['lmnp_reel', 'lmp'])).toBe(false)
  })

  it('accepte des alias dans la liste cible', () => {
    expect(isRegime({ fiscal_regime: 'foncier_nu' }, ['rental'])).toBe(true)
  })
})

describe('detecterRegimeFiscal — cas demandes (D10)', () => {
  it('1. LMNP avec recettes < seuil micro → lmnp_micro', () => {
    const r = detecterRegimeFiscal({
      type_location: 'meuble',
      recettes_annuelles: 12_000,
      tmi_pct: 30,
    })
    expect(r.recommande).toBe('lmnp_micro')
    expect(r.justification).toContain('micro-BIC')
  })

  it('2. LMNP avec recettes > seuil micro-BIC → lmnp_reel', () => {
    const r = detecterRegimeFiscal({
      type_location: 'meuble',
      recettes_annuelles: PLAFOND_MICRO_BIC + 1,
      tmi_pct: 30,
    })
    expect(r.recommande).toBe('lmnp_reel')
    expect(r.justification).toContain('reel')
  })

  it('3. Nu propriétaire avec TMI > 30 % → foncier_nu (reel) recommande', () => {
    const r = detecterRegimeFiscal({
      type_location: 'nu',
      recettes_annuelles: 6_000,           // sous le plafond micro-foncier
      tmi_pct: TMI_SEUIL_REEL_PCT + 11,    // 41 %
    })
    expect(r.recommande).toBe('foncier_nu')
    expect(r.justification).toContain('41 %')
  })

  it('4. Meuble de tourisme → meuble_tourisme (micro-BIC specifique)', () => {
    const r = detecterRegimeFiscal({
      type_location: 'tourisme',
      recettes_annuelles: 30_000,
      tmi_pct: 30,
    })
    expect(r.recommande).toBe('meuble_tourisme')
    expect(r.justification).toMatch(/tourisme|micro-bic/i)
  })

  it('5. Bien sans loyer → indetermine (pas de crash)', () => {
    const r = detecterRegimeFiscal({
      type_location: 'nu',
      recettes_annuelles: 0,
    })
    expect(r.recommande).toBe('indetermine')
    expect(r.justification).toContain('Aucun loyer')
  })

  it('Nu avec recettes >= 15 000 → foncier_nu obligatoire', () => {
    const r = detecterRegimeFiscal({
      type_location: 'nu',
      recettes_annuelles: PLAFOND_MICRO_FONCIER + 100,
      tmi_pct: 11,
    })
    expect(r.recommande).toBe('foncier_nu')
  })

  it('Nu avec recettes faibles + TMI moderee → foncier_micro', () => {
    const r = detecterRegimeFiscal({
      type_location: 'nu',
      recettes_annuelles: 8_000,
      tmi_pct: 11,
    })
    expect(r.recommande).toBe('foncier_micro')
  })
})
