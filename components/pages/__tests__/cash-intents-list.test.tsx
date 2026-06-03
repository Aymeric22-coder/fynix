/* @vitest-environment jsdom */
/**
 * Tests `CashIntentsList` — V1.2 Volet E.
 *
 * Couvre :
 *   - État vide (pas d'intent) → message pédagogique
 *   - Liste avec intents : libellé motif + précision libre, montant, date
 *     cible ou âge, lien compte associé
 *   - Ancre `#cash-intents` pour scroll depuis le badge matelas
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

import { CashIntentsList } from '../cash-intents-list'
import type { CashIntent } from '@/lib/cash/intents'

afterEach(cleanup)

function intent(over: Partial<CashIntent>): CashIntent {
  return {
    id:              'i-' + Math.random().toString(36).slice(2, 8),
    user_id:         'u-1',
    cash_account_id: null,
    montant:         5_000,
    motif:           'apport_immo',
    motif_libre:     null,
    target_date:     null,
    created_at:      new Date(Date.now() - 90 * 86_400_000).toISOString(),
    updated_at:      new Date().toISOString(),
    ...over,
  }
}

describe('CashIntentsList — états visuels', () => {
  it('état vide → message pédagogique + section ancrée', () => {
    const { container } = render(
      <CashIntentsList intents={[]} cashAccounts={[]} />,
    )
    expect(screen.getByText(/Aucune intention déclarée/i)).toBeTruthy()
    expect(screen.getByText(/Apport immobilier — achat Saint-Brieuc/i)).toBeTruthy()
    // L'ancre #cash-intents doit être présente pour le badge matelas.
    const section = container.querySelector('#cash-intents')
    expect(section).toBeTruthy()
  })

  it('liste : intent avec date cible → affiche la date', () => {
    const i = intent({
      montant:      8_000,
      motif:        'voyage',
      motif_libre:  'Tokyo automne',
      target_date:  '2026-11-15',
    })
    render(<CashIntentsList intents={[i]} cashAccounts={[]} />)
    expect(screen.getByText(/Voyage/i)).toBeTruthy()
    expect(screen.getByText(/Tokyo automne/i)).toBeTruthy()
    expect(screen.getByText(/Cible/)).toBeTruthy()
    // formatCurrency 8 000 € — NBSP entre chiffres et symbole
    const matches = screen.getAllByText((_text, node) =>
      node?.textContent?.includes('8') === true
      && node?.textContent?.includes('000') === true
      && node?.textContent?.includes('€') === true,
    )
    expect(matches.length).toBeGreaterThan(0)
  })

  it('liste : intent sans date cible → affiche « créée il y a X »', () => {
    const i = intent({
      target_date: null,
      created_at:  new Date(Date.now() - 90 * 86_400_000).toISOString(),
    })
    render(<CashIntentsList intents={[i]} cashAccounts={[]} />)
    expect(screen.getByText(/créée il y a/i)).toBeTruthy()
  })

  it('liste : intent rattachée à un compte → affiche « depuis <compte> »', () => {
    const i = intent({ cash_account_id: 'acc-1' })
    const accounts = [{ id: 'acc-1', name: 'Livret A Boursorama' }]
    render(<CashIntentsList intents={[i]} cashAccounts={accounts} />)
    expect(screen.getByText(/depuis Livret A Boursorama/i)).toBeTruthy()
  })

  it('liste : 2 intents distinctes affichées en séquence', () => {
    const intents = [
      intent({ id: 'a', motif: 'apport_immo',  montant: 5_000 }),
      intent({ id: 'b', motif: 'achat_planifie', montant: 3_000 }),
    ]
    render(<CashIntentsList intents={intents} cashAccounts={[]} />)
    expect(screen.getByText(/Apport immobilier/i)).toBeTruthy()
    expect(screen.getByText(/Achat planifié/i)).toBeTruthy()
  })
})
