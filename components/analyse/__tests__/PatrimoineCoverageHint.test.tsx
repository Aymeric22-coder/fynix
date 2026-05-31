/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PatrimoineCoverageHint } from '../PatrimoineCoverageHint'

afterEach(() => cleanup())

describe('PatrimoineCoverageHint', () => {
  it('totalNet === 0 → ne s\'affiche PAS (laisse EmptyBanner)', () => {
    render(<PatrimoineCoverageHint totalPortefeuille={0} totalCash={0} totalImmo={0} />)
    expect(screen.queryByTestId('patrimoine-coverage-hint')).toBeNull()
  })

  it('toutes les catégories renseignées → ne s\'affiche PAS', () => {
    render(<PatrimoineCoverageHint totalPortefeuille={50_000} totalCash={10_000} totalImmo={200_000} />)
    expect(screen.queryByTestId('patrimoine-coverage-hint')).toBeNull()
  })

  it('1 seule catégorie renseignée (portefeuille seul) → suggère 2 ajouts', () => {
    render(<PatrimoineCoverageHint totalPortefeuille={50_000} totalCash={0} totalImmo={0} />)
    expect(screen.getByTestId('patrimoine-coverage-hint')).toBeTruthy()
    expect(screen.getByText(/tes comptes/i)).toBeTruthy()
    expect(screen.getByText(/tes biens immobiliers/i)).toBeTruthy()
  })

  it('cash seul → suggère placements + immo (2 missing)', () => {
    render(<PatrimoineCoverageHint totalPortefeuille={0} totalCash={5_000} totalImmo={0} />)
    expect(screen.getByText(/tes placements financiers/i)).toBeTruthy()
    expect(screen.getByText(/tes biens immobiliers/i)).toBeTruthy()
  })

  it('portefeuille + cash sans immo → suggère 1 ajout', () => {
    render(<PatrimoineCoverageHint totalPortefeuille={50_000} totalCash={5_000} totalImmo={0} />)
    expect(screen.queryByText(/tes placements/i)).toBeNull()
    expect(screen.queryByText(/tes comptes/i)).toBeNull()
    expect(screen.getByText(/tes biens immobiliers/i)).toBeTruthy()
  })
})
