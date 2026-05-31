/* @vitest-environment jsdom */
/**
 * CS2 LOT 4 — Tests de PatrimoineEmptyBanner.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PatrimoineEmptyBanner } from '../PatrimoineEmptyBanner'

afterEach(() => cleanup())

describe('PatrimoineEmptyBanner', () => {
  it('wizard non complété → ne s\'affiche PAS', () => {
    render(<PatrimoineEmptyBanner wizardComplete={false} totalNet={0} />)
    expect(screen.queryByTestId('patrimoine-empty-banner')).toBeNull()
  })

  it('wizard complet + patrimoine > 0 → ne s\'affiche PAS', () => {
    render(<PatrimoineEmptyBanner wizardComplete={true} totalNet={50_000} />)
    expect(screen.queryByTestId('patrimoine-empty-banner')).toBeNull()
  })

  it('wizard complet + patrimoine vide → s\'affiche avec 2 CTAs', () => {
    render(<PatrimoineEmptyBanner wizardComplete={true} totalNet={0} />)
    expect(screen.getByTestId('patrimoine-empty-banner')).toBeTruthy()
    expect(screen.getByText(/On ne voit pas encore tes placements/i)).toBeTruthy()
    // CTA portefeuille
    const ctaPf = screen.getByText(/Ajouter mes placements/i).closest('a')
    expect(ctaPf?.getAttribute('href')).toBe('/portefeuille')
    // CTA cash
    const ctaCash = screen.getByText(/Ajouter mes comptes/i).closest('a')
    expect(ctaCash?.getAttribute('href')).toBe('/cash')
  })
})
