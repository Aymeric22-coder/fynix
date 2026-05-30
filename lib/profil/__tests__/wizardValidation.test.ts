/**
 * Tests de la validation réactive du wizard profil (Tâche B).
 *
 * `missingFields(step, values)` détermine les champs obligatoires absents
 * pour l'étape donnée. Vide = étape valide, bouton "Continuer" actif.
 * Seules les étapes critiques (1, 8) ont des contraintes.
 */
import { describe, it, expect } from 'vitest'
import { missingFields, REQUIRED_STEPS, SKIPPABLE_STEPS } from '../wizardValidation'
import { EMPTY_VALUES, type QuestionnaireValues } from '@/components/profil/questionnaire-types'

function mk(over: Partial<QuestionnaireValues> = {}): QuestionnaireValues {
  return { ...EMPTY_VALUES, ...over }
}

describe('constantes wizard', () => {
  it('REQUIRED_STEPS = [1, 8]', () => {
    expect([...REQUIRED_STEPS]).toEqual([1, 8])
  })
  // CS1 — ajout de l'étape 9 « Ta fiscalité » (skippable, tmi_rate null-OK).
  // CS5 — ajout de l'étape 10 « Projets de vie » (skippable, no-op aval).
  it('SKIPPABLE_STEPS = [2, 3, 6, 7, 9, 10]', () => {
    expect([...SKIPPABLE_STEPS]).toEqual([2, 3, 6, 7, 9, 10])
  })
  it('aucune étape n\'est à la fois requise et skippable', () => {
    for (const r of REQUIRED_STEPS) expect(SKIPPABLE_STEPS).not.toContain(r)
  })
})

describe('missingFields — étape 1 (identité)', () => {
  it('vide → 3 champs manquants', () => {
    expect(missingFields(1, mk())).toEqual(['âge', 'situation familiale', 'statut professionnel'])
  })
  it('complet → vide', () => {
    expect(missingFields(1, mk({
      age: 30, situation_familiale: 'Célibataire', statut_pro: 'Salarié',
    }))).toEqual([])
  })
  it('seul l\'âge manque', () => {
    expect(missingFields(1, mk({
      situation_familiale: 'En couple', statut_pro: 'Indépendant / Freelance',
    }))).toEqual(['âge'])
  })
  it('âge = 0 est considéré rempli (champ saisi explicitement)', () => {
    expect(missingFields(1, mk({
      age: 0, situation_familiale: 'Autre', statut_pro: 'Retraité',
    }))).toEqual([])
  })
})

describe('missingFields — étape 8 (FIRE)', () => {
  it('vide → 3 champs manquants', () => {
    expect(missingFields(8, mk())).toEqual(['type de FIRE', 'revenu passif cible', 'âge cible FIRE'])
  })
  it('complet → vide', () => {
    expect(missingFields(8, mk({
      fire_type: 'classic', revenu_passif_cible: 3000, age_cible: 50,
    }))).toEqual([])
  })
  it('revenu_passif_cible = 0 reste valide (utilisateur l\'a saisi)', () => {
    expect(missingFields(8, mk({
      fire_type: 'lean', revenu_passif_cible: 0, age_cible: 60,
    }))).toEqual([])
  })

  // CS3 R4 — revenu_passif_cible OPTIONNEL si fire_type = coast ou barista.
  describe('CS3 R4 — coast/barista → revenu_passif_cible optionnel', () => {
    it('fire_type=coast + revenu_passif_cible null → valide', () => {
      expect(missingFields(8, mk({
        fire_type: 'Coast FIRE', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual([])
    })

    it('fire_type=barista + revenu_passif_cible null → valide', () => {
      expect(missingFields(8, mk({
        fire_type: 'Barista FIRE', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual([])
    })

    it('fire_type=classic + revenu_passif_cible null → requis (legacy)', () => {
      expect(missingFields(8, mk({
        fire_type: 'classic', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual(['revenu passif cible'])
    })

    it('fire_type=lean + revenu_passif_cible null → requis (legacy)', () => {
      expect(missingFields(8, mk({
        fire_type: 'Lean FIRE', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual(['revenu passif cible'])
    })
  })
})

describe('missingFields — étapes non critiques', () => {
  it('étape 2 (revenus) → toujours vide même sans saisie', () => {
    expect(missingFields(2, mk())).toEqual([])
  })
  it('étapes 3, 4, 5, 6, 7 → toujours vide', () => {
    for (const step of [3, 4, 5, 6, 7]) {
      expect(missingFields(step, mk())).toEqual([])
    }
  })
  // CS1 — Étape 9 « Ta fiscalité » est toujours valide (tmi_rate null-OK,
  // fallback 30 % aval). Permet le skip et la non-régression sur les
  // profils existants qui n'ont jamais vu cette étape.
  it('étape 9 (fiscalité) → toujours vide (skippable, tmi_rate null-OK)', () => {
    expect(missingFields(9, mk())).toEqual([])
    expect(missingFields(9, mk({ tmi_rate: 41 }))).toEqual([])
    expect(missingFields(9, mk({ tmi_rate: null }))).toEqual([])
  })
})
