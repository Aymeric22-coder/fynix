/* @vitest-environment jsdom */
/**
 * Tests `CashFreshnessBadge` — V1.4 Vol D.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { CashFreshnessBadge } from '../cash-freshness-badge'

afterEach(cleanup)

describe('CashFreshnessBadge — rendu selon niveau', () => {
  it('balance_date récent → aucun badge', () => {
    const { container } = render(<CashFreshnessBadge balanceDate={new Date().toISOString().slice(0, 10)} />)
    expect(container.firstChild).toBeNull()
  })

  it('balance_date null → aucun badge', () => {
    const { container } = render(<CashFreshnessBadge balanceDate={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('balance_date il y a 100 jours → badge warning « Mise à jour à rafraîchir »', () => {
    const date = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10)
    render(<CashFreshnessBadge balanceDate={date} />)
    expect(screen.getByText(/Mise à jour à rafraîchir/i)).toBeTruthy()
  })

  it('balance_date il y a 200 jours → badge stale « Donnée ancienne »', () => {
    const date = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10)
    render(<CashFreshnessBadge balanceDate={date} />)
    expect(screen.getByText(/Donnée ancienne/i)).toBeTruthy()
  })
})
