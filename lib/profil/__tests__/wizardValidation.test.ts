/**
 * Tests de la validation réactive du wizard profil (Tâche B).
 *
 * `missingFields(step, values)` détermine les champs obligatoires absents
 * pour l'étape donnée. Vide = étape valide, bouton "Continuer" actif.
 * Seules les étapes critiques (1, 9 post-renumérotation) ont des contraintes.
 */
import { describe, it, expect } from 'vitest'
import { missingFields, REQUIRED_STEPS, SKIPPABLE_STEPS } from '../wizardValidation'
import { EMPTY_VALUES, type QuestionnaireValues } from '@/components/profil/questionnaire-types'

function mk(over: Partial<QuestionnaireValues> = {}): QuestionnaireValues {
  return { ...EMPTY_VALUES, ...over }
}

describe('constantes wizard', () => {
  // Renumérotation post-CS10 : Risque+FIRE est désormais ID 9 (ancien 8).
  it('REQUIRED_STEPS = [1, 9]', () => {
    expect([...REQUIRED_STEPS]).toEqual([1, 9])
  })
  // Renumérotation post-CS10 + Sprint consolidation 1 :
  // Fiscalité ID 4, Capacité 5, Quizzes 6/7/8, Projets de vie 10.
  // Toutes skippables (Step 5 ajouté en consolidation 1).
  it('SKIPPABLE_STEPS = [2, 3, 4, 5, 6, 7, 8, 10]', () => {
    expect([...SKIPPABLE_STEPS]).toEqual([2, 3, 4, 5, 6, 7, 8, 10])
  })

  // Sprint consolidation 1 — Step 5 Capacité doit être SKIPPABLE
  // (avant : ni REQUIRED ni SKIPPABLE → bouton Skip absent, UX ambigu).
  it('Step 5 (Capacité d\'investissement) est SKIPPABLE', () => {
    expect(SKIPPABLE_STEPS).toContain(5)
    expect(REQUIRED_STEPS).not.toContain(5)
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

describe('missingFields — étape 9 (FIRE, post-renumérotation)', () => {
  it('vide → 3 champs manquants', () => {
    expect(missingFields(9, mk())).toEqual(['type de FIRE', 'revenu passif cible', 'âge cible FIRE'])
  })
  it('complet → vide', () => {
    expect(missingFields(9, mk({
      fire_type: 'classic', revenu_passif_cible: 3000, age_cible: 50,
    }))).toEqual([])
  })
  it('revenu_passif_cible = 0 reste valide (utilisateur l\'a saisi)', () => {
    expect(missingFields(9, mk({
      fire_type: 'lean', revenu_passif_cible: 0, age_cible: 60,
    }))).toEqual([])
  })

  // CS3 R4 — revenu_passif_cible OPTIONNEL si fire_type = coast ou barista.
  describe('CS3 R4 — coast/barista → revenu_passif_cible optionnel', () => {
    it('fire_type=coast + revenu_passif_cible null → valide', () => {
      expect(missingFields(9, mk({
        fire_type: 'Coast FIRE', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual([])
    })

    it('fire_type=barista + revenu_passif_cible null → valide', () => {
      expect(missingFields(9, mk({
        fire_type: 'Barista FIRE', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual([])
    })

    it('fire_type=classic + revenu_passif_cible null → requis (legacy)', () => {
      expect(missingFields(9, mk({
        fire_type: 'classic', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual(['revenu passif cible'])
    })

    it('fire_type=lean + revenu_passif_cible null → requis (legacy)', () => {
      expect(missingFields(9, mk({
        fire_type: 'Lean FIRE', revenu_passif_cible: null, age_cible: 50,
      }))).toEqual(['revenu passif cible'])
    })
  })
})

describe('missingFields — étapes non critiques (post-renumérotation)', () => {
  it('étape 2 (revenus) → toujours vide même sans saisie', () => {
    expect(missingFields(2, mk())).toEqual([])
  })
  it('étapes 3, 4, 5, 6, 7, 8 → toujours vide', () => {
    for (const step of [3, 4, 5, 6, 7, 8]) {
      expect(missingFields(step, mk())).toEqual([])
    }
  })
  // Renumérotation : Fiscalité est désormais ID 4 (ancien 9).
  it('étape 4 (fiscalité) → toujours vide (skippable, tmi_rate null-OK)', () => {
    expect(missingFields(4, mk())).toEqual([])
    expect(missingFields(4, mk({ tmi_rate: 41 }))).toEqual([])
    expect(missingFields(4, mk({ tmi_rate: null }))).toEqual([])
  })
})
