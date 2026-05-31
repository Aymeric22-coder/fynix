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
// CS5 dette — Source unique : on importe les labels au lieu de les hardcoder
// dans les fixtures. Si un libellé change demain (« Crypto » → « Cryptomonnaie »),
// les tests suivent automatiquement.
import {
  ENVELOPPE_DEFS, envelopeLabelById,
} from '../enveloppesConstants'

const PEA      = envelopeLabelById('pea')
const AV       = envelopeLabelById('av')
const CTO      = envelopeLabelById('cto')
const LIVRET_A = envelopeLabelById('livreta')
const LDDS     = envelopeLabelById('ldds')
const CRYPTO   = envelopeLabelById('crypto')
const IMMO     = envelopeLabelById('immo')

function mk(over: Partial<QuestionnaireValues> = {}): QuestionnaireValues {
  return { ...EMPTY_VALUES, ...over }
}

// ─────────────────────────────────────────────────────────────────────
// 1 — Prédicats purs
// ─────────────────────────────────────────────────────────────────────

describe('prédicats purs', () => {
  it('hasCryptoEnvelope — true uniquement si la chip Crypto est cochée', () => {
    expect(hasCryptoEnvelope(mk({ enveloppes: [PEA, CRYPTO] }))).toBe(true)
    expect(hasCryptoEnvelope(mk({ enveloppes: [CRYPTO] }))).toBe(true)
    // CS5 dette — CTO ne déclenche PAS R1 (classes:['equity'] only). Si
    // l'user a aussi de la crypto via CTO ETP, il coche la chip Crypto.
    expect(hasCryptoEnvelope(mk({ enveloppes: [PEA, CTO] }))).toBe(false)
    expect(hasCryptoEnvelope(mk({ enveloppes: [PEA, AV] }))).toBe(false)
    expect(hasCryptoEnvelope(mk({ enveloppes: [] }))).toBe(false)
    expect(hasCryptoEnvelope(mk())).toBe(false)
  })

  it('hasImmoEnvelope — true uniquement si la chip Immobilier / SCPI est cochée', () => {
    expect(hasImmoEnvelope(mk({ enveloppes: [IMMO] }))).toBe(true)
    expect(hasImmoEnvelope(mk({ enveloppes: [PEA, IMMO] }))).toBe(true)
    expect(hasImmoEnvelope(mk({ enveloppes: [PEA, AV] }))).toBe(false)
    expect(hasImmoEnvelope(mk({ enveloppes: [] }))).toBe(false)
  })

  it('isRetraite — chip Step 1', () => {
    expect(isRetraite(mk({ statut_pro: 'Retraité' }))).toBe(true)
    expect(isRetraite(mk({ statut_pro: 'retraité' }))).toBe(true)
    expect(isRetraite(mk({ statut_pro: 'Salarié' }))).toBe(false)
    expect(isRetraite(mk())).toBe(false)
  })

  // CS5 dette — Test de non-régression explicite : sanity check de l'inversion
  // logique du moteur SKIP_RULES. Un profil PEA seul ne déclenche ni R1 ni R2 ;
  // un profil Crypto seul DÉSACTIVE R1 (Quiz Crypto visible).
  it('non-régression — enveloppes=[PEA] : R1 et R2 PAS déclenchées (les deux quiz auraient été affichés à tort si refactor cassait l\'inversion)', () => {
    expect(hasCryptoEnvelope(mk({ enveloppes: [PEA] }))).toBe(false)
    expect(hasImmoEnvelope(mk({ enveloppes: [PEA] }))).toBe(false)
  })
  it('non-régression — enveloppes=[Crypto] : R1 NE doit PAS skip Quiz Crypto', () => {
    expect(hasCryptoEnvelope(mk({ enveloppes: [CRYPTO] }))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 2 — Garde-fou anti-faux-positif : enveloppes=[] = Step 4 sauté
// ─────────────────────────────────────────────────────────────────────

describe('R1/R2 garde-fou — enveloppes=[]', () => {
  it('enveloppes=[] (Step 5 sauté) → AUCUN skip auto', () => {
    const path = computeActivePath(mk({ enveloppes: [] }))
    // Renumérotation post-CS10 — ALL_STEPS naturel [1..10]. Aucun skip
    // tant que enveloppes n'a pas été touché (garde-fou anti-faux-positif).
    expect(path).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('enveloppes=[PEA] (Step 5 touché, sans crypto/immo) → skip 7+8', () => {
    const path = computeActivePath(mk({ enveloppes: [PEA] }))
    // R1 skip Quiz Crypto (nouvel ID 7), R2 skip Quiz Immo (nouvel ID 8).
    expect(path).toEqual([1, 2, 3, 4, 5, 6, 9, 10])
  })
})

// ─────────────────────────────────────────────────────────────────────
// 3 — R3 réinterprété : copie différente pour retraité
// ─────────────────────────────────────────────────────────────────────

describe('R3 réinterprété — copie retraité', () => {
  // Post-renumérotation : Quiz Crypto = step 7, Quiz Bourse = step 6.
  it('non-retraité, pas de crypto → message standard', () => {
    const v = mk({ enveloppes: [PEA], statut_pro: 'Salarié' })
    const reason = findSkipReason(7, v)
    expect(reason).toMatch(/n'as pas déclaré d'enveloppe crypto/i)
    expect(reason).not.toMatch(/retraité/i)
  })

  it('retraité, pas de crypto → message reformulé', () => {
    const v = mk({ enveloppes: [PEA], statut_pro: 'Retraité' })
    const reason = findSkipReason(7, v)
    expect(reason).toMatch(/retraité/i)
    expect(reason).toMatch(/crypto/i)
  })

  it('retraité ne skippe PAS la Bourse (Step 6 reste utile)', () => {
    const v = mk({ enveloppes: [PEA], statut_pro: 'Retraité' })
    expect(computeActivePath(v)).toContain(6)
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

  // Renumérotation post-CS10 : Quiz Crypto = 7, Quiz Immo = 8.
  // Longueurs des paths inchangées (seul l'ID des skips a évolué).
  const personas: Persona[] = [
    {
      nom: 'a. Thomas — primo-investisseur 28 ans, locataire',
      values: { age: 28, statut_pro: 'Salarié', enveloppes: [LIVRET_A] },
      expect: { length: 8, skips: [7, 8] },  // pas crypto, pas immo
    },
    {
      nom: 'b. Sophie — multi-biens, SCI (CRYPTO + IMMO réels)',
      values: { age: 45, statut_pro: 'Indépendant / Freelance',
                enveloppes: [PEA, CTO, CRYPTO, IMMO] },
      expect: { length: 10, skips: [] },
    },
    {
      nom: 'c. Marc — cadre TMI 41 %',
      values: { age: 52, statut_pro: 'Salarié',
                enveloppes: [PEA, AV] },
      expect: { length: 8, skips: [7, 8] },
    },
    {
      nom: 'd. Léo — aspirant FIRE',
      values: { age: 35, statut_pro: 'Salarié',
                enveloppes: [PEA, CTO, CRYPTO] },
      expect: { length: 9, skips: [8] },
    },
    {
      nom: 'e. Famille Bernard — couple + enfants (IMMO via SCPI)',
      values: { age: 40, statut_pro: 'Salarié',
                enveloppes: [AV, PEA, IMMO] },
      expect: { length: 9, skips: [7] },   // pas crypto, immo OK (chip Immobilier / SCPI)
    },
    {
      nom: 'f. Annie — proche retraite',
      values: { age: 60, statut_pro: 'Retraité',
                enveloppes: [AV, LIVRET_A] },
      expect: { length: 8, skips: [7, 8] },
    },
    {
      nom: 'g. Karim — freelance revenus irréguliers',
      values: { age: 33, statut_pro: 'Indépendant / Freelance',
                enveloppes: [PEA] },
      expect: { length: 8, skips: [7, 8] },
    },
    {
      nom: 'h. Hélène — prudente, averse au risque',
      values: { age: 48, statut_pro: 'Salarié',
                enveloppes: [LIVRET_A, LDDS, AV] },
      expect: { length: 8, skips: [7, 8] },
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
  // Post-renumérotation : Quiz Bourse=6, Quiz Crypto=7, Quiz Immo=8, FIRE=9.
  it('Thomas (skip 7 et 8) → 6 → next = 9', () => {
    const v = mk({ enveloppes: [LIVRET_A] })
    expect(getNextStep(6, v)).toBe(9)
  })

  it('Sophie (path complet) → 6 → next = 7', () => {
    const v = mk({ enveloppes: [PEA, CRYPTO, IMMO] })
    expect(getNextStep(6, v)).toBe(7)
  })

  it('dernière étape du path → END', () => {
    // Post-renumérotation : path 8 étapes pour [LIVRET_A] (skip 7+8), dernière = 10.
    const v = mk({ enveloppes: [LIVRET_A] })
    expect(getNextStep(10, v)).toBe(END)
  })
})

describe('getPrevStep — POINT CRITIQUE (cf. §7-2 cadrage)', () => {
  it('Thomas (skip 7) → 9 → prev = 6 (PAS 8 qui serait sauté)', () => {
    const v = mk({ enveloppes: [LIVRET_A] })
    expect(getPrevStep(9, v)).toBe(6)
  })

  it('première étape → null', () => {
    expect(getPrevStep(1, mk())).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// 6 — Overrides session (« Je veux quand même y répondre »)
// ─────────────────────────────────────────────────────────────────────

describe('overrides — réactive l\'étape pour la session', () => {
  // Post-renumérotation : Quiz Crypto = step 7.
  it('override sur step 7 → path inclut 7 même sans crypto', () => {
    const v = mk({ enveloppes: [PEA] })
    const overrides = new Set<StepId>([7])
    const path = computeActivePath(v, overrides)
    expect(path).toContain(7)
  })

  it('override sur step 7 → findSkipReason retourne null', () => {
    const v = mk({ enveloppes: [PEA] })
    expect(findSkipReason(7, v)).not.toBeNull()
    expect(findSkipReason(7, v, new Set([7]))).toBeNull()
  })

  it('isStepSkipped respecte les overrides', () => {
    const v = mk({ enveloppes: [PEA] })
    expect(isStepSkipped(7, v)).toBe(true)
    expect(isStepSkipped(7, v, new Set([7]))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 7 — Re-routage rétroactif
// ─────────────────────────────────────────────────────────────────────

describe('re-routage rétroactif', () => {
  it('ajouter Crypto à enveloppes ré-active Step 7 au prochain call', () => {
    const v1 = mk({ enveloppes: [PEA] })
    expect(computeActivePath(v1)).not.toContain(7)
    const v2 = mk({ enveloppes: [PEA, CRYPTO] })
    expect(computeActivePath(v2)).toContain(7)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 8 — CS5 dette — Garde-fou single source of truth
// ─────────────────────────────────────────────────────────────────────

describe('CS5 dette — single source of truth des chips', () => {
  it('ENVELOPPE_DEFS contient au moins une chip de classe crypto', () => {
    // Sinon hasCryptoEnvelope retournerait toujours false — bug originel.
    expect(ENVELOPPE_DEFS.some((d) => d.classes.includes('crypto'))).toBe(true)
  })
  it('ENVELOPPE_DEFS contient au moins une chip de classe immo', () => {
    expect(ENVELOPPE_DEFS.some((d) => d.classes.includes('immo'))).toBe(true)
  })
  it('CRYPTO et IMMO labels résolus sans throw (envelopeLabelById)', () => {
    expect(CRYPTO).toBe('Crypto')
    expect(IMMO).toBe('Immobilier / SCPI')
  })
})
