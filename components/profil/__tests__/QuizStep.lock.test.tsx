/* @vitest-environment jsdom */
/**
 * Fix QW10 — Tests du lock du choix au premier clic.
 *
 * Garantit que :
 *   - Aucune réponse → toutes les options cliquables.
 *   - Premier clic sur option d'une question → cette question devient
 *     verrouillée (boutons disabled + aria-disabled + tabindex=-1 sur
 *     les non-sélectionnés). Les autres questions restent cliquables.
 *   - Tentative de re-clic sur une autre option d'une question verrouillée
 *     → onChange n'est PAS appelé (lock défensif côté handler + disabled
 *     côté bouton).
 *   - La micro-leçon QW10 reste visible après lock (compte-rendu
 *     permanent, plus de "disparaît si tu corriges").
 *   - Lecture depuis quiz_X[i] !== -1 → reprise wizard hérite du lock
 *     pour les questions déjà répondues.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react'
import { QuizStep } from '../QuizStep'
import { QUIZ_CATALOG } from '@/lib/profil/quizCatalog'

afterEach(() => cleanup())

const BOURSE = QUIZ_CATALOG.bourse

/** Retourne les boutons radio (options) d'une question donnée. */
function optionsOf(qIndex: number): HTMLButtonElement[] {
  const groups = screen.getAllByRole('radiogroup')
  const group  = groups[qIndex]
  if (!group) throw new Error(`pas de radiogroup #${qIndex}`)
  return within(group).getAllByRole('radio') as HTMLButtonElement[]
}

function renderWith(answers: number[], onChange = vi.fn()) {
  render(
    <QuizStep
      badge="x" quiz={BOURSE} answers={answers}
      onChange={onChange} domain="bourse"
      selfDeclared={[]} onExpertToggle={vi.fn()}
    />,
  )
  return { onChange }
}

// ────────────────────────────────────────────────────────────────────
// 1 — État initial : toutes les options cliquables
// ────────────────────────────────────────────────────────────────────

describe('Fix QW10 — état initial : aucune réponse', () => {
  it('toutes les options sont cliquables (pas de disabled, pas d\'aria-disabled true)', () => {
    renderWith([-1, -1, -1, -1])
    for (let qi = 0; qi < BOURSE.length; qi++) {
      for (const btn of optionsOf(qi)) {
        expect(btn.disabled).toBe(false)
        expect(btn.getAttribute('aria-disabled')).toBe('false')
      }
    }
  })
})

// ────────────────────────────────────────────────────────────────────
// 2 — Premier clic verrouille la question (mais pas les autres)
// ────────────────────────────────────────────────────────────────────

describe('Fix QW10 — premier clic verrouille la question', () => {
  it('cliquer option 1 de question 0 → onChange [1,-1,-1,-1]', () => {
    const { onChange } = renderWith([-1, -1, -1, -1])
    const opts0 = optionsOf(0)
    fireEvent.click(opts0[1]!)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toEqual([1, -1, -1, -1])
  })

  it('après render avec answers=[0,-1,-1,-1] : question 0 lockée, question 1 cliquable', () => {
    renderWith([0, -1, -1, -1])
    // Question 0 lockée : toutes ses options disabled + aria-disabled true
    for (const btn of optionsOf(0)) {
      expect(btn.disabled).toBe(true)
      expect(btn.getAttribute('aria-disabled')).toBe('true')
    }
    // Question 1 cliquable
    for (const btn of optionsOf(1)) {
      expect(btn.disabled).toBe(false)
      expect(btn.getAttribute('aria-disabled')).toBe('false')
    }
  })

  it('options non-sélectionnées d\'une question lockée : tabindex=-1', () => {
    renderWith([0, -1, -1, -1])  // q0 répondue à option 0
    const opts0 = optionsOf(0)
    // L'option sélectionnée (index 0) garde tabindex 0 (focus utile pour
    // les lecteurs d'écran qui annoncent "ta réponse").
    expect(opts0[0]!.getAttribute('tabindex')).toBe('0')
    // Les autres sortent du tab order.
    expect(opts0[1]!.getAttribute('tabindex')).toBe('-1')
    expect(opts0[2]!.getAttribute('tabindex')).toBe('-1')
    expect(opts0[3]!.getAttribute('tabindex')).toBe('-1')
  })
})

// ────────────────────────────────────────────────────────────────────
// 3 — Re-clic ignoré (garde-fou défensif côté handler)
// ────────────────────────────────────────────────────────────────────

describe('Fix QW10 — re-clic sur question lockée ignoré', () => {
  it('re-cliquer une autre option d\'une question lockée → onChange jamais rappelé', () => {
    // q0 répondue à option 0 (fausse — correctIndex de q0 est 0 pour ETF,
    // peu importe : on teste que le clic est bloqué).
    const { onChange } = renderWith([0, -1, -1, -1])
    const opts0 = optionsOf(0)
    // Le bouton est disabled → fireEvent.click n'émet pas de click sur un
    // disabled, donc le handler ne tourne pas. C'est exactement ce qu'on
    // veut. On vérifie qu'onChange n'a pas été appelé.
    fireEvent.click(opts0[1]!)
    fireEvent.click(opts0[2]!)
    fireEvent.click(opts0[3]!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('garde-fou handler : si un clic passe (testé en court-circuitant disabled), selectOption refuse', () => {
    // On ne peut pas court-circuiter `disabled` via fireEvent — mais on
    // peut tester indirectement : un re-render avec un nouvel onChange
    // après lock + click sur la même option (sélectionnée) ne déclenche
    // PAS de onChange (la sélectionnée est aussi disabled).
    const onChange = vi.fn()
    renderWith([0, -1, -1, -1], onChange)
    const opts0 = optionsOf(0)
    fireEvent.click(opts0[0]!)  // l'option déjà sélectionnée
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────
// 4 — Micro-leçon QW10 persiste après lock
// ────────────────────────────────────────────────────────────────────

describe('Fix QW10 — micro-leçon reste visible après lock', () => {
  it('mauvaise réponse lockée → leçon affichée, et reste affichée au re-render', () => {
    const q0 = BOURSE[0]!
    const wrong = (q0.correctIndex + 1) % q0.options.length
    const { rerender } = render(
      <QuizStep
        badge="x" quiz={BOURSE} answers={[wrong]}
        onChange={vi.fn()} domain="bourse"
        selfDeclared={[]} onExpertToggle={vi.fn()}
      />,
    )
    expect(screen.queryByTestId(`micro-lesson-${q0.id}`)).not.toBeNull()
    // Re-render identique : leçon persiste.
    rerender(
      <QuizStep
        badge="x" quiz={BOURSE} answers={[wrong, -1, -1, -1]}
        onChange={vi.fn()} domain="bourse"
        selfDeclared={[]} onExpertToggle={vi.fn()}
      />,
    )
    expect(screen.queryByTestId(`micro-lesson-${q0.id}`)).not.toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────
// 5 — Reprise wizard : quiz_X partiellement rempli
// ────────────────────────────────────────────────────────────────────

describe('Fix QW10 — reprise wizard hérite du lock', () => {
  it('quiz_X = [0,1,-1,-1] → questions 0 & 1 lockées, 2 & 3 cliquables', () => {
    renderWith([0, 1, -1, -1])
    expect(optionsOf(0).every((b) => b.disabled)).toBe(true)
    expect(optionsOf(1).every((b) => b.disabled)).toBe(true)
    expect(optionsOf(2).every((b) => !b.disabled)).toBe(true)
    expect(optionsOf(3).every((b) => !b.disabled)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────
// 6 — Non-régression Expert auto-déclaré (CS3 R5)
// ────────────────────────────────────────────────────────────────────

describe('Fix QW10 — non-régression Expert auto-déclaré', () => {
  it('selfDeclared=["bourse"] → aucune radiogroup rendue → pas de question à locker', () => {
    render(
      <QuizStep
        badge="x" quiz={BOURSE} answers={[]}
        onChange={vi.fn()} domain="bourse"
        selfDeclared={['bourse']} onExpertToggle={vi.fn()}
      />,
    )
    expect(screen.queryAllByRole('radiogroup').length).toBe(0)
    expect(screen.getByText(/déclaré connaître/i)).toBeTruthy()
  })
})
