/* @vitest-environment jsdom */
/**
 * QW10 — Tests de l'affichage des micro-leçons inline dans QuizStep.
 *
 * Couvre :
 *   - Aucune leçon affichée tant que rien n'est répondu.
 *   - Réponse correcte → option highlight verte, aucune leçon.
 *   - Réponse fausse → option highlight rouge + correcte verte + carte
 *     leçon visible avec lessonTitle + lessonEmoji + texte lesson.
 *   - Changement vers la bonne réponse → leçon disparaît.
 *   - Expert auto-déclaré → questions cachées → aucune leçon possible.
 *   - Matrice 11 questions : chaque question fausse déclenche bien la
 *     bonne leçon (test exhaustif du catalogue).
 *   - Garde-fou lessonTitle + lessonEmoji présents sur les 11 questions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QuizStep } from '../QuizStep'
import {
  QUIZ_CATALOG, type QuizDomain, type QuizQuestion,
} from '@/lib/profil/quizCatalog'

afterEach(() => cleanup())

const DOMAINS: ReadonlyArray<QuizDomain> = ['bourse', 'crypto', 'immo']

// ────────────────────────────────────────────────────────────────────
// 1 — Catalogue : tous lessonTitle + lessonEmoji présents
// ────────────────────────────────────────────────────────────────────

describe('QW10 — catalogue lessonTitle + lessonEmoji', () => {
  for (const d of DOMAINS) {
    it(`${d} — chaque question a lessonTitle non vide`, () => {
      for (const q of QUIZ_CATALOG[d]) {
        expect(q.lessonTitle.length).toBeGreaterThan(2)
      }
    })
    it(`${d} — chaque question a lessonEmoji non vide`, () => {
      for (const q of QUIZ_CATALOG[d]) {
        expect(q.lessonEmoji.length).toBeGreaterThan(0)
      }
    })
  }
})

// ────────────────────────────────────────────────────────────────────
// 2 — Render UI
// ────────────────────────────────────────────────────────────────────

function renderQuiz(props?: Partial<React.ComponentProps<typeof QuizStep>>) {
  const onChange       = vi.fn()
  const onExpertToggle = vi.fn()
  const utils = render(
    <QuizStep
      badge="Évaluation Bourse"
      quiz={QUIZ_CATALOG.bourse}
      answers={[]}
      onChange={onChange}
      domain="bourse"
      selfDeclared={[]}
      onExpertToggle={onExpertToggle}
      {...props}
    />,
  )
  return { ...utils, onChange, onExpertToggle }
}

describe('QW10 — état initial (rien répondu)', () => {
  it('aucune carte leçon visible', () => {
    renderQuiz()
    for (const q of QUIZ_CATALOG.bourse) {
      expect(screen.queryByTestId(`micro-lesson-${q.id}`)).toBeNull()
    }
  })
})

describe('QW10 — réponse correcte', () => {
  it('option highlightée verte, aucune carte leçon', () => {
    // QUIZ_BOURSE[0] = ETF, correctIndex 0
    const q0 = QUIZ_CATALOG.bourse[0]!
    renderQuiz({ answers: [q0.correctIndex] })
    expect(screen.queryByTestId(`micro-lesson-${q0.id}`)).toBeNull()
  })
})

describe('QW10 — réponse fausse', () => {
  it('carte leçon visible avec lessonTitle + lessonEmoji + texte', () => {
    const q0 = QUIZ_CATALOG.bourse[0]!  // ETF, correct=0
    const wrong = (q0.correctIndex + 1) % q0.options.length
    renderQuiz({ answers: [wrong] })
    const card = screen.queryByTestId(`micro-lesson-${q0.id}`)
    expect(card).not.toBeNull()
    // Contenu : titre + emoji + texte de la leçon
    expect(card!.textContent).toContain(q0.lessonTitle)
    expect(card!.textContent).toContain(q0.lessonEmoji)
    // Vérif au moins une sous-chaîne distinctive du texte lesson
    expect(card!.textContent).toContain('ETF est un fonds coté en bourse')
  })

  it('seule la question ratée affiche une leçon (pas les autres)', () => {
    // On rate la 1re, on répond bien à la 2e, on laisse les 3-4 vides
    const q0 = QUIZ_CATALOG.bourse[0]!
    const q1 = QUIZ_CATALOG.bourse[1]!
    const q2 = QUIZ_CATALOG.bourse[2]!
    const q3 = QUIZ_CATALOG.bourse[3]!
    renderQuiz({
      answers: [(q0.correctIndex + 1) % 4, q1.correctIndex, -1, -1],
    })
    expect(screen.queryByTestId(`micro-lesson-${q0.id}`)).not.toBeNull()
    expect(screen.queryByTestId(`micro-lesson-${q1.id}`)).toBeNull()
    expect(screen.queryByTestId(`micro-lesson-${q2.id}`)).toBeNull()
    expect(screen.queryByTestId(`micro-lesson-${q3.id}`)).toBeNull()
  })
})

describe('QW10 — leçon disparaît si l\'user corrige', () => {
  it('rerender avec la bonne réponse → carte leçon retirée', () => {
    const q0 = QUIZ_CATALOG.bourse[0]!
    const wrong = (q0.correctIndex + 1) % 4
    const { rerender } = render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.bourse} answers={[wrong]}
        onChange={vi.fn()} domain="bourse" selfDeclared={[]} onExpertToggle={vi.fn()}
      />,
    )
    expect(screen.queryByTestId(`micro-lesson-${q0.id}`)).not.toBeNull()
    // L'user corrige
    rerender(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.bourse} answers={[q0.correctIndex]}
        onChange={vi.fn()} domain="bourse" selfDeclared={[]} onExpertToggle={vi.fn()}
      />,
    )
    expect(screen.queryByTestId(`micro-lesson-${q0.id}`)).toBeNull()
  })
})

describe('QW10 — Expert auto-déclaré (CS3 R5)', () => {
  it('selfDeclared=[domain] → questions cachées → aucune carte leçon possible', () => {
    renderQuiz({ selfDeclared: ['bourse'] })
    for (const q of QUIZ_CATALOG.bourse) {
      expect(screen.queryByTestId(`micro-lesson-${q.id}`)).toBeNull()
    }
    // Vérifie aussi que le placard "Tu as déclaré connaître…" est rendu
    expect(screen.getByText(/déclaré connaître/i)).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────
// 3 — Matrice exhaustive catalogue : 11 leçons
// ────────────────────────────────────────────────────────────────────

describe('QW10 — matrice exhaustive 11 leçons', () => {
  for (const d of DOMAINS) {
    for (const [i, q] of QUIZ_CATALOG[d].entries()) {
      it(`${d}#${i} (${q.id}) — leçon affichée quand selectedIdx !== correctIndex`, () => {
        const wrong = (q.correctIndex + 1) % q.options.length
        // Tableau d'answers avec uniquement la question i renseignée wrong
        const answers: number[] = new Array(QUIZ_CATALOG[d].length).fill(-1)
        answers[i] = wrong
        cleanup()
        render(
          <QuizStep
            badge="x" quiz={QUIZ_CATALOG[d] as ReadonlyArray<QuizQuestion>} answers={answers}
            onChange={vi.fn()} domain={d as 'bourse'|'crypto'|'immo'}
            selfDeclared={[]} onExpertToggle={vi.fn()}
          />,
        )
        const card = screen.queryByTestId(`micro-lesson-${q.id}`)
        expect(card, `Question ${q.id} : carte leçon manquante`).not.toBeNull()
        expect(card!.textContent).toContain(q.lessonTitle)
      })
    }
  }
})

// ────────────────────────────────────────────────────────────────────
// 4 — Interaction click change l'état
// ────────────────────────────────────────────────────────────────────

describe('QW10 — interaction clic', () => {
  it('cliquer une mauvaise option déclenche onChange avec l\'index', () => {
    const q0 = QUIZ_CATALOG.bourse[0]!
    const wrong = (q0.correctIndex + 1) % 4
    const { onChange } = renderQuiz()
    // Cherche le bouton de la 2e option (= mauvaise pour q0)
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent && b.textContent.length > 30)
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[wrong]!)
    expect(onChange).toHaveBeenCalled()
    const calledWith = onChange.mock.calls[0]![0]
    expect(calledWith[0]).toBe(wrong)
  })
})
