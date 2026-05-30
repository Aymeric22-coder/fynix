/* @vitest-environment jsdom */
/**
 * CS1 — Tests du bandeau « Renseigne ta TMI » sur /analyse.
 *
 * Conditions d'affichage :
 *   - profile loaded (pas en cours de chargement)
 *   - tmi_rate IS NULL
 *   - profile_completed_at IS NOT NULL
 *   - non dismissé via localStorage
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { TmiMissingBanner } from '../TmiMissingBanner'

// Mock du hook useUserProfile — on contrôle la valeur retournée par test.
type ProfileSubset = {
  tmi_rate: number | null
  profile_completed_at: string | null
} | null

const mockProfile = vi.fn<() => { profile: ProfileSubset; loading: boolean }>()

vi.mock('@/hooks/use-user-profile', () => ({
  useUserProfile: () => mockProfile(),
}))

beforeEach(() => {
  window.localStorage.clear()
  mockProfile.mockReset()
})

afterEach(() => { cleanup() })

describe('<TmiMissingBanner>', () => {
  it("s'affiche si tmi_rate=null ET profil complet", () => {
    mockProfile.mockReturnValue({
      profile: { tmi_rate: null, profile_completed_at: '2026-01-15T00:00:00Z' },
      loading: false,
    })
    render(<TmiMissingBanner />)
    expect(screen.getByText(/Renseigne ta TMI/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Renseigner ma TMI/i })).toHaveAttribute('href', '/profil')
  })

  it("ne s'affiche pas si tmi_rate est renseigné", () => {
    mockProfile.mockReturnValue({
      profile: { tmi_rate: 41, profile_completed_at: '2026-01-15T00:00:00Z' },
      loading: false,
    })
    const { container } = render(<TmiMissingBanner />)
    expect(container.innerHTML).toBe('')
  })

  it("ne s'affiche pas si le profil n'est pas complet (profile_completed_at null)", () => {
    mockProfile.mockReturnValue({
      profile: { tmi_rate: null, profile_completed_at: null },
      loading: false,
    })
    const { container } = render(<TmiMissingBanner />)
    expect(container.innerHTML).toBe('')
  })

  it("ne s'affiche pas pendant le loading", () => {
    mockProfile.mockReturnValue({ profile: null, loading: true })
    const { container } = render(<TmiMissingBanner />)
    expect(container.innerHTML).toBe('')
  })

  it("clic sur « Plus tard » dismissé le bandeau (localStorage persistant)", () => {
    mockProfile.mockReturnValue({
      profile: { tmi_rate: null, profile_completed_at: '2026-01-15T00:00:00Z' },
      loading: false,
    })
    const { container, rerender } = render(<TmiMissingBanner />)
    expect(container.textContent).toMatch(/Renseigne ta TMI/i)
    fireEvent.click(screen.getByRole('button', { name: /Plus tard/i }))
    // Après le clic, le composant est démonté côté React → rerender pour
    // re-vérifier l'état persistant (localStorage devrait être set).
    rerender(<TmiMissingBanner />)
    expect(container.innerHTML).toBe('')
    expect(window.localStorage.getItem('fynix.tmi-missing-banner.dismissed')).toBe('1')
  })
})
