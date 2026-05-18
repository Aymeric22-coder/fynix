/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { FiscalKpiBanner } from '../fiscal-kpi-banner'
import type { OpportuniteFiscale } from '@/lib/analyse/optimiseurFiscal'

function makeOpp(gainAnnuel: number, applicable = true): OpportuniteFiscale {
  return {
    id:               `opp-${gainAnnuel}`,
    categorie:        'enveloppe',
    titre:            'Test opportunité',
    description:      'desc',
    gain_annuel_eur:  gainAnnuel,
    gain_5ans_eur:    gainAnnuel * 5,
    effort:           'faible',
    priorite:         2,
    action_concrete:  'agis',
    conditions:       [],
    applicable,
  }
}

describe('<FiscalKpiBanner>', () => {
  afterEach(() => { cleanup() })

  it('affiche le total et le lien vers /analyse?tab=optimiser quand gain > 0', () => {
    const opportunites = [makeOpp(1500), makeOpp(900)]
    render(<FiscalKpiBanner opportunites={opportunites} />)

    // Le total annuel doit être présent (1500 + 900 = 2400)
    expect(screen.getByText(/2[\s ]?400/)).toBeInTheDocument()
    // Le total sur 5 ans (12 000)
    expect(screen.getByText(/12[\s ]?000/)).toBeInTheDocument()
    // Le lien vers l'onglet Optimiser
    const link = screen.getByRole('link', { name: /voir les opportunités/i })
    expect(link).toHaveAttribute('href', '/analyse?tab=optimiser')
  })

  it('ne rend rien quand opportunites est vide', () => {
    const { container } = render(<FiscalKpiBanner opportunites={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien quand toutes les opportunités sont non-applicables ou à gain 0', () => {
    const opportunites = [makeOpp(2000, false), makeOpp(0, true)]
    const { container } = render(<FiscalKpiBanner opportunites={opportunites} />)
    expect(container).toBeEmptyDOMElement()
  })
})
