/* @vitest-environment jsdom */
/**
 * Consolidation 2 — Test d'intégration QuizStep + ConfirmDialog.
 *
 * Vérifie que le pattern Expert auto-déclaré CS3 R5 fonctionne avec
 * la nouvelle modal stylée (remplacement de window.confirm).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QuizStep } from '../QuizStep'
import { QUIZ_CATALOG } from '@/lib/profil/quizCatalog'

afterEach(() => cleanup())

describe('QuizStep + ConfirmDialog (consolidation 2)', () => {
  it('click « Je connais déjà » → ouvre la modal (pas de window.confirm)', () => {
    const onExpertToggle = vi.fn()
    render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.bourse} answers={[]}
        onChange={vi.fn()} domain="bourse"
        selfDeclared={[]} onExpertToggle={onExpertToggle}
      />,
    )
    // Avant clic → pas de modal
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
    // Clic sur le bouton « Je connais déjà — Expert »
    fireEvent.click(screen.getByRole('button', { name: /Je connais déjà/i }))
    // Modal apparaît avec le titre attendu
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy()
    expect(screen.getByText('Te déclarer expert')).toBeTruthy()
    // onExpertToggle PAS encore appelé (attente confirmation)
    expect(onExpertToggle).not.toHaveBeenCalled()
  })

  it('clic Confirm dans la modal → push du domaine via onExpertToggle', () => {
    const onExpertToggle = vi.fn()
    render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.crypto} answers={[]}
        onChange={vi.fn()} domain="crypto"
        selfDeclared={[]} onExpertToggle={onExpertToggle}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Je connais déjà/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Je suis expert' }))
    expect(onExpertToggle).toHaveBeenCalledWith(['crypto'])
  })

  it('clic Cancel dans la modal → rien ne change', () => {
    const onExpertToggle = vi.fn()
    render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.immo} answers={[]}
        onChange={vi.fn()} domain="immo"
        selfDeclared={[]} onExpertToggle={onExpertToggle}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Je connais déjà/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuer le quiz' }))
    expect(onExpertToggle).not.toHaveBeenCalled()
    // Modal fermée
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })

  it('déjà expert → clic sur le bouton ANNULE immédiat (sans modal)', () => {
    const onExpertToggle = vi.fn()
    render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.bourse} answers={[]}
        onChange={vi.fn()} domain="bourse"
        selfDeclared={['bourse']} onExpertToggle={onExpertToggle}
      />,
    )
    // Le bouton affiche maintenant le label « annuler »
    fireEvent.click(screen.getByRole('button', { name: /Niveau Expert auto-déclaré/i }))
    // Pas de modal — onExpertToggle appelé directement pour pull le domaine
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
    expect(onExpertToggle).toHaveBeenCalledWith([])
  })

  it('mention du domaine bourse dans la description', () => {
    render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.bourse} answers={[]}
        onChange={vi.fn()} domain="bourse"
        selfDeclared={[]} onExpertToggle={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Je connais déjà/i }))
    expect(screen.getByText('Bourse')).toBeTruthy()
  })

  it('mention du domaine crypto dans la description', () => {
    render(
      <QuizStep
        badge="x" quiz={QUIZ_CATALOG.crypto} answers={[]}
        onChange={vi.fn()} domain="crypto"
        selfDeclared={[]} onExpertToggle={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Je connais déjà/i }))
    expect(screen.getByText('Crypto')).toBeTruthy()
  })
})
