/* @vitest-environment jsdom */
/**
 * Tests UI de ResetProfileModal.
 *
 * Vérifie :
 *   - Bouton « Réinitialiser » disabled tant que l'utilisateur n'a pas
 *     tapé exactement "RESET" (case-sensitive).
 *   - Liste « ce qui sera effacé » + « préservé » présentes.
 *   - Annuler appelle onClose.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { ResetProfileModal } from '../ResetProfileModal'

// next/navigation mock : useRouter().push doit exister.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => {
  // fetch ne doit pas être appelé tant qu'on n'a pas tapé RESET et cliqué.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
    JSON.stringify({ data: { ok: true, redirect: '/bienvenue' }, error: null }),
    { status: 200 },
  ))))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function getResetBtn() {
  return screen.getByRole('button', { name: 'Réinitialiser' })
}

describe('<ResetProfileModal>', () => {
  it('par défaut : bouton Réinitialiser disabled (texte vide)', () => {
    const onClose = vi.fn()
    render(<ResetProfileModal open onClose={onClose} />)
    expect(getResetBtn()).toBeDisabled()
  })

  it('tape "reset" (minuscule) → reste disabled', () => {
    render(<ResetProfileModal open onClose={() => {}} />)
    const input = screen.getByLabelText(/Tape.*pour confirmer/i)
    fireEvent.change(input, { target: { value: 'reset' } })
    expect(getResetBtn()).toBeDisabled()
  })

  it('tape "RESET" (exact) → bouton activé', () => {
    render(<ResetProfileModal open onClose={() => {}} />)
    const input = screen.getByLabelText(/Tape.*pour confirmer/i)
    fireEvent.change(input, { target: { value: 'RESET' } })
    expect(getResetBtn()).not.toBeDisabled()
  })

  it('tape "RESETT" (trop long) → reste disabled', () => {
    render(<ResetProfileModal open onClose={() => {}} />)
    const input = screen.getByLabelText(/Tape.*pour confirmer/i)
    fireEvent.change(input, { target: { value: 'RESETT' } })
    expect(getResetBtn()).toBeDisabled()
  })

  it('liste « ce qui sera effacé » et « ce qui sera préservé » sont présentes', () => {
    render(<ResetProfileModal open onClose={() => {}} />)
    expect(screen.getByText(/Ce qui sera effacé/i)).toBeInTheDocument()
    expect(screen.getByText(/Ce qui sera préservé/i)).toBeInTheDocument()
    // Mentions clés
    expect(screen.getByText(/wizard.*étapes 1 à 9/i)).toBeInTheDocument()
    expect(screen.getByText(/positions/i)).toBeInTheDocument()
  })

  it('clic Annuler appelle onClose', () => {
    const onClose = vi.fn()
    render(<ResetProfileModal open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('POST /api/profile/reset déclenché quand on confirme', async () => {
    render(<ResetProfileModal open onClose={() => {}} />)
    const input = screen.getByLabelText(/Tape.*pour confirmer/i)
    fireEvent.change(input, { target: { value: 'RESET' } })
    fireEvent.click(getResetBtn())
    // fetch a été appelé avec /api/profile/reset
    expect(fetch).toHaveBeenCalledWith('/api/profile/reset', { method: 'POST' })
  })
})
