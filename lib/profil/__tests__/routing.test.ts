/**
 * CS3 — Tests du moteur de routage du wizard profil.
 *
 * Couvre :
 *   1. Prédicats purs : hasCryptoEnvelope, hasImmoEnvelope, isRetraite.
 *   2. R1 / R2 garde-fou : enveloppes=[] (Step 4 sauté) ne déclenche AUCUN skip.
 *   3. R3 réinterprété : copie skip différente pour retraité.
 *   4. computeActivePath sur 8 personas du plan (preuve concrète que la
 *      longueur du parcours actif descend pour les profils ciblés).
 *   5. getNextStep / getPrevStep cohérents avec activePath.
 *   6. Overrides session : « Je veux quand même y répondre » réactive l'étape.
 *   7. Re-routage rétroactif : modifier enveloppes ré-évalue le path.
 */
import { describe, it, expect } from 'vitest'
import {
  hasCryptoEnvelope, hasImmoEnvelope, isRetraite,
  computeActivePath, getNextStep, getPrevStep, findSkipReason,
  isStepSkipped, END, type StepId,
} from '../routing'
import { EMPTY_VALUES, type QuestionnaireValues } from '@/components/profil/questionnaire-types'

function mk(over: Partial<QuestionnaireValues> = {}): QuestionnaireValues {
  return { ...EMPTY_VALUES, ...over }
}

// ─────────────────────────────────────────────────────────────────────
// 1 — Prédicats purs
// ─────────────────────────────────────────────────────────────────────

describe('prédicats purs', () => {
  it('hasCryptoEnvelope — matche insensible casse', () => {
    expect(hasCryptoEnvelope(mk({ enveloppes: ['PEA', 'Crypto'] }))).toBe(true)
    expect(hasCryptoEnvelope(mk({ enveloppes: ['pea', 'crypto'] }))).toBe(true)
    expect(hasCryptoEnvelope(mk({ enveloppes: ['PEA', 'AV'] }))).toBe(false)
    expect(hasCryptoEnvelope(mk({ enveloppes: [] }))).toBe(false)
    expect(hasCryptoEnvelope(mk())).toBe(false)
  })

  it('hasImmoEnvelope — matche immo OU scpi', () => {
    expect(hasImmoEnvelope(mk({ enveloppes: ['SCPI'] }))).toBe(true)
    expect(hasImmoEnvelope(mk({ enveloppes: ['Immobilier'] }))).toBe(true)
    expect(hasImmoEnvelope(mk({ enveloppes: ['scpi'] }))).toBe(true)
    expect(hasImmoEnvelope(mk({ enveloppes: ['PEA', 'AV'] }))).toBe(false)
  })

  it('isRetraite — chip Step 1', () => {
    expect(isRetraite(mk({ statut_pro: 'Retraité' }))).toBe(true)
    expect(isRetraite(mk({ statut_pro: 'retraité' }))).toBe(true)
    expect(isRetraite(mk({ statut_pro: 'Salarié' }))).toBe(false)
    expect(isRetraite(mk())).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 2 — Garde-fou anti-faux-positif : enveloppes=[] = Step 4 sauté
// ─────────────────────────────────────────────────────────────────────

describe('R1/R2 garde-fou — enveloppes=[]', () => {
  it('enveloppes=[] (Step 4 sauté) → AUCUN skip auto', () => {
    const path = computeActivePath(mk({ enveloppes: [] }))
    expect(path).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('enveloppes=["PEA"] (Step 4 touché, sans crypto/immo) → skip 6+7', () => {
    const path = computeActivePath(mk({ enveloppes: ['PEA'] }))
    expect(path).toEqual([1, 2, 3, 4, 5, 8, 9])
  })
})

// ─────────────────────────────────────────────────────────────────────
// 3 — R3 réinterprété : copie différente pour retraité
// ─────────────────────────────────────────────────────────────────────

describe('R3 réinterprété — copie retraité', () => {
  it('non-retraité, pas de crypto → message standard', () => {
    const v = mk({ enveloppes: ['PEA'], statut_pro: 'Salarié' })
    const reason = findSkipReason(6, v)
    expect(reason).toMatch(/n'as pas déclaré d'enveloppe crypto/i)
    expect(reason).not.toMatch(/retraité/i)
  })

  it('retraité, pas de crypto → message reformulé', () => {
    const v = mk({ enveloppes: ['PEA'], statut_pro: 'Retraité' })
    const reason = findSkipReason(6, v)
    expect(reason).toMatch(/retraité/i)
    expect(reason).toMatch(/crypto/i)
  })

  it('retraité ne skippe PAS la Bourse (Step 5 reste utile)', () => {
    const v = mk({ enveloppes: ['PEA'], statut_pro: 'Retraité' })
    expect(computeActivePath(v)).toContain(5)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 4 — Matrice 8 personas
// ─────────────────────────────────────────────────────────────────────

describe('computeActivePath — 8 personas du plan', () => {
  type Persona = {
    nom:    string
    values: Partial<QuestionnaireValues>
    expect: { length: number; skips: StepId[] }
  }

  const personas: Persona[] = [
    {
      nom: 'a. Thomas — primo-investisseur 28 ans, locataire',
      values: { age: 28, statut_pro: 'Salarié', enveloppes: ['Livret A'] },
      expect: { length: 7, skips: [6, 7] },  // pas crypto, pas immo
    },
    {
      nom: 'b. Sophie — multi-biens, SCI',
      values: { age: 45, statut_pro: 'Indépendant / Freelance',
                enveloppes: ['PEA', 'CTO', 'Crypto', 'Immobilier'] },
      expect: { length: 9, skips: [] },
    },
    {
      nom: 'c. Marc — cadre TMI 41 %',
      values: { age: 52, statut_pro: 'Salarié',
                enveloppes: ['PEA', 'Assurance-vie'] },
      expect: { length: 7, skips: [6, 7] },
    },
    {
      nom: 'd. Léo — aspirant FIRE',
      values: { age: 35, statut_pro: 'Salarié',
                enveloppes: ['PEA', 'CTO', 'Crypto'] },
      expect: { length: 8, skips: [7] },
    },
    {
      nom: 'e. Famille Bernard — couple + enfants',
      values: { age: 40, statut_pro: 'Salarié',
                enveloppes: ['Assurance-vie', 'PEA', 'SCPI'] },
      expect: { length: 8, skips: [6] },   // pas crypto, immo OK (SCPI)
    },
    {
      nom: 'f. Annie — proche retraite',
      values: { age: 60, statut_pro: 'Retraité',
                enveloppes: ['Assurance-vie', 'Livret A'] },
      expect: { length: 7, skips: [6, 7] },
    },
    {
      nom: 'g. Karim — freelance revenus irréguliers',
      values: { age: 33, statut_pro: 'Indépendant / Freelance',
                enveloppes: ['PEA'] },
      expect: { length: 7, skips: [6, 7] },
    },
    {
      nom: 'h. Hélène — prudente, averse au risque',
      values: { age: 48, statut_pro: 'Salarié',
                enveloppes: ['Livret A', 'LDDS', 'Assurance-vie'] },
      expect: { length: 7, skips: [6, 7] },
    },
  ]

  for (const persona of personas) {
    it(`${persona.nom} → ${persona.expect.length} étapes (skips ${JSON.stringify(persona.expect.skips)})`, () => {
      const path = computeActivePath(mk(persona.values))
      expect(path.length).toBe(persona.expect.length)
      for (const skipped of persona.expect.skips) {
        expect(path).not.toContain(skipped)
      }
    })
  }
})

// ─────────────────────────────────────────────────────────────────────
// 5 — getNextStep / getPrevStep
// ─────────────────────────────────────────────────────────────────────

describe('getNextStep — saute correctement', () => {
  it('Thomas (skip 6 et 7) → 5 → next = 8', () => {
    const v = mk({ enveloppes: ['Livret A'] })
    expect(getNextStep(5, v)).toBe(8)
  })

  it('Sophie (path complet) → 5 → next = 6', () => {
    const v = mk({ enveloppes: ['PEA', 'Crypto', 'Immobilier'] })
    expect(getNextStep(5, v)).toBe(6)
  })

  it('dernière étape du path → END', () => {
    const v = mk({ enveloppes: ['Livret A'] })  // path 7 étapes, dernière = 9
    expect(getNextStep(9, v)).toBe(END)
  })
})

describe('getPrevStep — POINT CRITIQUE (cf. §7-2 cadrage)', () => {
  it('Thomas (skip 6) → 8 → prev = 5 (PAS 7 qui serait sauté)', () => {
    const v = mk({ enveloppes: ['Livret A'] })
    expect(getPrevStep(8, v)).toBe(5)
  })

  it('première étape → null', () => {
    expect(getPrevStep(1, mk())).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// 6 — Overrides session (« Je veux quand même y répondre »)
// ─────────────────────────────────────────────────────────────────────

describe('overrides — réactive l\'étape pour la session', () => {
  it('override sur step 6 → path inclut 6 même sans crypto', () => {
    const v = mk({ enveloppes: ['PEA'] })
    const overrides = new Set<StepId>([6])
    const path = computeActivePath(v, overrides)
    expect(path).toContain(6)
  })

  it('override sur step 6 → findSkipReason retourne null', () => {
    const v = mk({ enveloppes: ['PEA'] })
    expect(findSkipReason(6, v)).not.toBeNull()
    expect(findSkipReason(6, v, new Set([6]))).toBeNull()
  })

  it('isStepSkipped respecte les overrides', () => {
    const v = mk({ enveloppes: ['PEA'] })
    expect(isStepSkipped(6, v)).toBe(true)
    expect(isStepSkipped(6, v, new Set([6]))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 7 — Re-routage rétroactif
// ─────────────────────────────────────────────────────────────────────

describe('re-routage rétroactif', () => {
  it('ajouter Crypto à enveloppes ré-active Step 6 au prochain call', () => {
    const v1 = mk({ enveloppes: ['PEA'] })
    expect(computeActivePath(v1)).not.toContain(6)
    const v2 = mk({ enveloppes: ['PEA', 'Crypto'] })
    expect(computeActivePath(v2)).toContain(6)
  })
})
