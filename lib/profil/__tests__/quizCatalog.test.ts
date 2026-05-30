/**
 * CS6 — Tests du quiz catalog enrichi.
 *
 * Couvre :
 *   1. Cohérence interne (ids uniques, tags uniques par domaine, correctIndex
 *      dans la plage des options, lessons non vides).
 *   2. `deriveMissedConcepts` — matrice de cas (0 ratée / 1 ratée / toutes /
 *      sentinel -1 = non répondue / mix).
 *   3. `deriveMissedConceptTags` cohérent avec `deriveMissedConcepts`.
 *   4. Garde-fou single-source-of-truth : aucun fichier hors `quizCatalog.ts`
 *      ne re-déclare un texte de question. Si quelqu'un copie-colle un libellé
 *      ailleurs, ce test casse au commit.
 *   5. Sanity check : la rétrocompat `QUIZ_BOURSE/CRYPTO/IMMO` (calculs.ts)
 *      pointe bien sur `QUIZ_CATALOG.<domain>`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  QUIZ_CATALOG, getQuizQuestions,
  deriveMissedConcepts, deriveMissedConceptTags,
  QUIZ_ANSWER_SENTINEL_UNANSWERED,
  type QuizDomain,
} from '../quizCatalog'
import {
  QUIZ_BOURSE, QUIZ_CRYPTO, QUIZ_IMMO,
} from '../calculs'

const DOMAINS: ReadonlyArray<QuizDomain> = ['bourse', 'crypto', 'immo']

// ────────────────────────────────────────────────────────────────────
// 1 — Cohérence interne
// ────────────────────────────────────────────────────────────────────

describe('QUIZ_CATALOG — cohérence interne', () => {
  for (const d of DOMAINS) {
    it(`${d} — ids uniques`, () => {
      const ids = QUIZ_CATALOG[d].map((q) => q.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
    it(`${d} — tags uniques`, () => {
      const tags = QUIZ_CATALOG[d].map((q) => q.tag)
      expect(new Set(tags).size).toBe(tags.length)
    })
    it(`${d} — correctIndex dans plage des options`, () => {
      for (const q of QUIZ_CATALOG[d]) {
        expect(q.correctIndex).toBeGreaterThanOrEqual(0)
        expect(q.correctIndex).toBeLessThan(q.options.length)
      }
    })
    it(`${d} — toutes les questions ont 4 options`, () => {
      for (const q of QUIZ_CATALOG[d]) {
        expect(q.options.length).toBe(4)
      }
    })
    it(`${d} — lessons non vides (au moins 100 caractères)`, () => {
      for (const q of QUIZ_CATALOG[d]) {
        expect(q.lesson.length).toBeGreaterThanOrEqual(100)
      }
    })
  }
})

// ────────────────────────────────────────────────────────────────────
// 2 — deriveMissedConcepts
// ────────────────────────────────────────────────────────────────────

describe('deriveMissedConcepts', () => {
  it('0 ratée (toutes correctes) → liste vide', () => {
    const correct = QUIZ_CATALOG.bourse.map((q) => q.correctIndex)
    expect(deriveMissedConcepts('bourse', correct)).toHaveLength(0)
  })

  it('toutes ratées → toutes les questions retournées', () => {
    // 4 questions Bourse, on inverse systématiquement
    const allWrong = QUIZ_CATALOG.bourse.map((q) => (q.correctIndex + 1) % q.options.length)
    const missed = deriveMissedConcepts('bourse', allWrong)
    expect(missed).toHaveLength(QUIZ_CATALOG.bourse.length)
    expect(missed.map((q) => q.id)).toEqual(QUIZ_CATALOG.bourse.map((q) => q.id))
  })

  it('1 ratée (la 1re) → 1 retournée', () => {
    const wrong0 = [
      (QUIZ_CATALOG.bourse[0]!.correctIndex + 1) % 4,
      ...QUIZ_CATALOG.bourse.slice(1).map((q) => q.correctIndex),
    ]
    const missed = deriveMissedConcepts('bourse', wrong0)
    expect(missed).toHaveLength(1)
    expect(missed[0]!.id).toBe(QUIZ_CATALOG.bourse[0]!.id)
  })

  it('Expert auto-déclaré (toutes -1) → liste vide (pas un raté actif)', () => {
    const sentinel = QUIZ_CATALOG.crypto.map(() => QUIZ_ANSWER_SENTINEL_UNANSWERED)
    expect(deriveMissedConcepts('crypto', sentinel)).toHaveLength(0)
  })

  it('mix répondu + non répondu (-1) — seules les MAUVAISES répondues comptent', () => {
    const quiz = QUIZ_CATALOG.crypto
    // q0 correcte, q1 ratée, q2 non répondue (-1), q3 ratée
    const answers = [
      quiz[0]!.correctIndex,
      (quiz[1]!.correctIndex + 1) % 4,
      QUIZ_ANSWER_SENTINEL_UNANSWERED,
      (quiz[3]!.correctIndex + 1) % 4,
    ]
    const missed = deriveMissedConcepts('crypto', answers)
    expect(missed.map((q) => q.id)).toEqual([quiz[1]!.id, quiz[3]!.id])
  })

  it('answers null/undefined ignorés (non répondu = non raté actif)', () => {
    const quiz = QUIZ_CATALOG.bourse
    // q0 correcte, q1 null, q2 undefined, q3 ratée
    const answers: Array<number | null | undefined> = [
      quiz[0]!.correctIndex,
      null,
      undefined,
      (quiz[3]!.correctIndex + 1) % 4,
    ]
    const missed = deriveMissedConcepts('bourse', answers)
    expect(missed).toHaveLength(1)
    expect(missed[0]!.id).toBe(quiz[3]!.id)
  })

  it('answers vide → liste vide', () => {
    expect(deriveMissedConcepts('immo', [])).toHaveLength(0)
  })

  it('answers plus long que quiz → ignore les trailing', () => {
    const quiz = QUIZ_CATALOG.immo
    const answers = quiz.map((q) => q.correctIndex).concat([0, 1, 2, 3])
    expect(deriveMissedConcepts('immo', answers)).toHaveLength(0)
  })

  it('deriveMissedConceptTags cohérent avec deriveMissedConcepts', () => {
    const quiz = QUIZ_CATALOG.crypto
    const answers = [
      (quiz[0]!.correctIndex + 1) % 4,
      quiz[1]!.correctIndex,
      (quiz[2]!.correctIndex + 1) % 4,
      quiz[3]!.correctIndex,
    ]
    const tags = deriveMissedConceptTags('crypto', answers)
    expect(tags).toEqual([quiz[0]!.tag, quiz[2]!.tag])
  })
})

// ────────────────────────────────────────────────────────────────────
// 3 — getQuizQuestions
// ────────────────────────────────────────────────────────────────────

describe('getQuizQuestions', () => {
  it('retourne le tableau du catalogue', () => {
    expect(getQuizQuestions('bourse')).toBe(QUIZ_CATALOG.bourse)
    expect(getQuizQuestions('crypto')).toBe(QUIZ_CATALOG.crypto)
    expect(getQuizQuestions('immo')).toBe(QUIZ_CATALOG.immo)
  })
})

// ────────────────────────────────────────────────────────────────────
// 4 — Rétro-compat QUIZ_BOURSE/CRYPTO/IMMO (calculs.ts)
// ────────────────────────────────────────────────────────────────────

describe('Rétro-compatibilité ré-export calculs.ts', () => {
  it('QUIZ_BOURSE === QUIZ_CATALOG.bourse', () => {
    expect(QUIZ_BOURSE).toBe(QUIZ_CATALOG.bourse)
  })
  it('QUIZ_CRYPTO === QUIZ_CATALOG.crypto', () => {
    expect(QUIZ_CRYPTO).toBe(QUIZ_CATALOG.crypto)
  })
  it('QUIZ_IMMO === QUIZ_CATALOG.immo', () => {
    expect(QUIZ_IMMO).toBe(QUIZ_CATALOG.immo)
  })
})

// ────────────────────────────────────────────────────────────────────
// 5 — Garde-fou single source of truth (anti-régression statique)
// ────────────────────────────────────────────────────────────────────
//
// Si quelqu'un copie-colle un texte de question dans un autre fichier
// (oubli de l'import depuis quizCatalog), ce test échoue. La règle :
// AUCUN fichier `.ts`/`.tsx` hors `quizCatalog.ts` ne doit contenir le
// libellé exact d'une question. Les tests sont exclus (ils citent les
// textes pour assertions ciblées — légitime).

describe('Garde-fou single source of truth', () => {
  const REPO_ROOT = process.cwd()
  // Sélection conservative : on scanne lib/ et components/profil/. La logique
  // métier qui parle des quiz vit là.
  const SCAN_DIRS = ['lib', 'components/profil', 'app']
  const EXCLUDE_FILES = new Set<string>([
    'lib/profil/quizCatalog.ts',
    'lib/profil/__tests__/quizCatalog.test.ts',
    'lib/profil/__tests__/calculs.test.ts', // tests historiques peuvent référencer
  ])

  function walk(dir: string): string[] {
    const out: string[] = []
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return out }
    for (const e of entries) {
      const full = join(dir, e)
      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          if (e === 'node_modules' || e === '.next') continue
          out.push(...walk(full))
        } else if (e.endsWith('.ts') || e.endsWith('.tsx')) {
          out.push(full)
        }
      } catch { /* ignore */ }
    }
    return out
  }

  it('aucun fichier hors quizCatalog.ts ne re-déclare un libellé de question', () => {
    // On prend les 11 libellés et on cherche leur présence textuelle. Pour
    // limiter les faux positifs, on prend une sous-chaîne distinctive
    // (>= 30 caractères) de chaque libellé.
    const allQuestions = [...QUIZ_CATALOG.bourse, ...QUIZ_CATALOG.crypto, ...QUIZ_CATALOG.immo]
    const needles = allQuestions.map((q) => q.text.slice(0, 35))

    const offenders: string[] = []
    for (const root of SCAN_DIRS) {
      const files = walk(join(REPO_ROOT, root))
      for (const f of files) {
        const rel = relative(REPO_ROOT, f).replace(/\\/g, '/')
        if (EXCLUDE_FILES.has(rel)) continue
        let src: string
        try { src = readFileSync(f, 'utf-8') } catch { continue }
        for (const n of needles) {
          if (src.includes(n)) {
            offenders.push(`${rel} contient « ${n}… »`)
            break // un seul hit par fichier suffit pour signaler
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
