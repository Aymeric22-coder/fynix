/* @vitest-environment jsdom */
/**
 * Consolidation 2 — Tests de <ConfirmDialog>.
 *
 * Couvre :
 *   - open=false → rien rendu (composant complètement absent du DOM).
 *   - open=true → modal visible avec title + description + 2 boutons.
 *   - Click Confirm → onConfirm appelé une fois + onOpenChange(false).
 *   - Click Cancel → onConfirm PAS appelé + onOpenChange(false).
 *   - Escape → onConfirm PAS appelé + onOpenChange(false) (héritage Modal).
 *   - Click-outside (overlay) → onOpenChange(false).
 *   - Variant 'destructive' → bouton Confirm a la classe danger.
 *   - Re-trigger (close puis reopen) → state reset propre.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from '../confirm-dialog'

afterEach(() => cleanup())

describe('ConfirmDialog', () => {
  it('open=false → rien rendu', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Test"
        description="Desc"
        onConfirm={() => {}}
      />,
    )
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })

  it('open=true → title + description + 2 boutons par défaut', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Te déclarer expert"
        description="En te déclarant…"
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy()
    expect(screen.getByText('Te déclarer expert')).toBeTruthy()
    expect(screen.getByText('En te déclarant…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
  })

  it('Click Confirm → onConfirm appelé + onOpenChange(false)', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="t" description="d"
        onConfirm={onConfirm}
        confirmLabel="Je suis expert"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Je suis expert' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Click Cancel → onConfirm PAS appelé + onOpenChange(false)', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="t" description="d"
        onConfirm={onConfirm}
        cancelLabel="Continuer le quiz"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continuer le quiz' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Escape ferme la modal (héritage Modal)', () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="t" description="d"
        onConfirm={onConfirm}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('variant destructive → bouton Confirm a la classe danger', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="t" description="d"
        confirmLabel="Supprimer"
        variant="destructive"
        onConfirm={() => {}}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Supprimer' })
    expect(btn.className).toContain('danger')
  })

  it('variant default → bouton Confirm a la classe primary (accent)', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="t" description="d"
        confirmLabel="OK"
        onConfirm={() => {}}
      />,
    )
    const btn = screen.getByRole('button', { name: 'OK' })
    // primary variant = bg-accent
    expect(btn.className).toContain('accent')
  })

  it('re-trigger après cancel → modal se ré-ouvre proprement', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <ConfirmDialog
        open={true} onOpenChange={onOpenChange}
        title="t" description="d" onConfirm={onConfirm}
      />,
    )
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy()
    // Cancel → parent ferme
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    rerender(
      <ConfirmDialog
        open={false} onOpenChange={onOpenChange}
        title="t" description="d" onConfirm={onConfirm}
      />,
    )
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
    // Réouverture
    rerender(
      <ConfirmDialog
        open={true} onOpenChange={onOpenChange}
        title="t" description="d" onConfirm={onConfirm}
      />,
    )
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy()
    // onConfirm jamais appelé pendant tout ce cycle
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Enter confirme quand la modal est ouverte', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true} onOpenChange={onOpenChange}
        title="t" description="d" onConfirm={onConfirm}
      />,
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('open=false → keydown ne déclenche rien', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={false} onOpenChange={() => {}}
        title="t" description="d" onConfirm={onConfirm}
      />,
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
