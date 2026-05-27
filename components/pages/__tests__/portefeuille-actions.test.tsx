/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

// Stub des modales qui montent des hooks/effets non pertinents pour ce test —
// on vérifie uniquement la présence du bouton « Importer CSV » et de son
// texte d'aide brokers, indépendamment du comportement de la modale.
vi.mock('@/components/forms/add-position-form', () => ({
  AddPositionForm: () => null,
}))
vi.mock('@/components/portfolio/import-csv-modal', () => ({
  PortfolioImportCSVModal: () => null,
}))
// Le composant utilise desormais useRouter() (refresh apres TX) — pas
// monte par defaut en jsdom, on neutralise.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
// Modale TX : on ne teste pas son rendu interne ici.
vi.mock('@/components/portfolio/add-transaction-modal', () => ({
  AddTransactionModal: () => null,
}))

import { PortefeuilleActions } from '../portefeuille-actions'

describe('<PortefeuilleActions>', () => {
  afterEach(() => { cleanup() })

  it('affiche le bouton « Importer CSV » avec son texte d’aide brokers', () => {
    render(<PortefeuilleActions envelopes={[]} />)
    const importBtn = screen.getByRole('button', { name: /importer csv/i })
    expect(importBtn).toBeInTheDocument()
    // Texte d'aide brokers visible sous le bouton
    expect(screen.getByText(/Boursorama, Degiro, Trade Republic/i)).toBeInTheDocument()
  })

  it('rend également le bouton principal « Ajouter une position »', () => {
    render(<PortefeuilleActions envelopes={[]} />)
    expect(screen.getByRole('button', { name: /ajouter une position/i })).toBeInTheDocument()
  })
})
