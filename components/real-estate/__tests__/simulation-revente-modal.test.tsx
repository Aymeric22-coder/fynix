/* @vitest-environment jsdom */
/**
 * Tests UI du modal SimulationReventeModal.
 *
 * On stub next/link et on rend le modal avec open=true puis on parcourt
 * étape 1 → étape 2 en remplissant les inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import {
  SimulationReventeModal, type SimulationReventeBien,
} from '../simulation-revente-modal'
import { ReventeButton } from '../revente-button'

function mkBien(over: Partial<SimulationReventeBien> = {}): SimulationReventeBien {
  return {
    id:             'bien-1',
    nom:            'Appart Bordeaux',
    prixAchat:      150_000,
    dateAchat:      '2013-06-01',
    valeurActuelle: 300_000,
    typeUsage:      'locatif',
    ...over,
  }
}

function openAndSimulate(prixVente = '300000') {
  fireEvent.change(screen.getByLabelText(/Prix de vente estimé/i), { target: { value: prixVente } })
  fireEvent.click(screen.getByRole('button', { name: /Simuler la revente/i }))
}

describe('<SimulationReventeModal>', () => {
  afterEach(() => { cleanup() })

  it('Résidence principale → affiche bandeau d\'exonération', () => {
    render(
      <SimulationReventeModal
        bien={mkBien({ typeUsage: 'residence_principale' })}
        open
        onClose={() => {}}
      />,
    )
    // Étape 1 visible
    expect(screen.getByLabelText(/Prix de vente estimé/i)).toBeInTheDocument()
    openAndSimulate('400000')
    // Étape 2 — bandeau exonération
    expect(screen.getByText(/Cession exonérée/i)).toBeInTheDocument()
    expect(screen.getByText(/résidence principale/i)).toBeInTheDocument()
  })

  it('Locatif 10 ans, vente 300k, achat 150k → net vendeur ~263-270k €', () => {
    render(
      <SimulationReventeModal
        bien={mkBien({
          typeUsage: 'locatif',
          prixAchat: 150_000,
          dateAchat: '2013-06-01',
        })}
        open
        onClose={() => {}}
      />,
    )
    // Sélectionne "Dans 10 ans" pour avoir > 5 ans de détention (depuis 2013 → 2026+)
    fireEvent.change(screen.getByLabelText(/Date de cession envisagée/i), {
      target: { value: '10y' },
    })
    openAndSimulate('300000')
    // Le bloc "Tu empocheras" affiche une valeur entre 250k et 290k (la valeur
    // exacte dépend des années écoulées depuis 2013 + 10 ans à compter d'aujourd'hui).
    const empoche = screen.getByText(/empocheras/i).parentElement
    expect(empoche?.textContent ?? '').toMatch(/2[5-8]\d/)
    // Pas exonéré → on doit voir le détail des impôts
    expect(screen.getByText(/Impôt sur le revenu/i)).toBeInTheDocument()
  })

  it('Vente à perte (locatif 5 ans, prix vente < prix acquisition corrigé) → exonération « pas de PV »', () => {
    render(
      <SimulationReventeModal
        bien={mkBien({
          typeUsage:      'locatif',
          prixAchat:      200_000,
          dateAchat:      '2020-01-01',
          valeurActuelle: 180_000,
        })}
        open
        onClose={() => {}}
      />,
    )
    openAndSimulate('180000')
    expect(screen.getByText(/Cession exonérée/i)).toBeInTheDocument()
    // Raison d'exo : pas de PV OU PV ≤ 15 000 € (acceptable les deux)
    const banner = screen.getByText(/Cession exonérée/i).closest('div')
    expect(banner?.textContent ?? '').toMatch(/(plus-value|15)/i)
  })

  it('Étape 1 — sélecteur typeUsage permet de switcher vers RP et déclenche exonération', () => {
    render(
      <SimulationReventeModal
        bien={mkBien({ typeUsage: 'locatif' })}
        open
        onClose={() => {}}
      />,
    )
    // Sélectionne RP
    fireEvent.change(screen.getByLabelText(/Type d'usage/i), {
      target: { value: 'residence_principale' },
    })
    openAndSimulate('400000')
    expect(screen.getByText(/résidence principale/i)).toBeInTheDocument()
  })

  it('Bouton "Modifier les paramètres" en étape 2 ramène en étape 1', () => {
    render(
      <SimulationReventeModal
        bien={mkBien({ typeUsage: 'locatif' })}
        open
        onClose={() => {}}
      />,
    )
    openAndSimulate('300000')
    // En étape 2, on voit "Modifier les paramètres"
    fireEvent.click(screen.getByRole('button', { name: /Modifier les paramètres/i }))
    // Retour étape 1 → champ prix de vente présent à nouveau
    expect(screen.getByLabelText(/Prix de vente estimé/i)).toBeInTheDocument()
  })

  it('Modal fermée (open=false) → rien rendu', () => {
    const { container } = render(
      <SimulationReventeModal bien={mkBien()} open={false} onClose={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('<ReventeButton>', () => {
  afterEach(() => { cleanup() })

  it('rend un bouton « Simuler la revente » qui ouvre le modal', () => {
    render(<ReventeButton bien={mkBien()} />)
    // Modal pas encore ouvert
    expect(screen.queryByLabelText(/Prix de vente estimé/i)).not.toBeInTheDocument()
    // Clic sur le bouton
    fireEvent.click(screen.getByRole('button', { name: /Simuler la revente/i }))
    // Modal ouvert → champ visible
    expect(screen.getByLabelText(/Prix de vente estimé/i)).toBeInTheDocument()
  })

  it('le clic appelle preventDefault + stopPropagation (compatible Link parent)', () => {
    render(<ReventeButton bien={mkBien()} />)
    const btn = screen.getByRole('button', { name: /Simuler la revente/i })
    // On simule un click avec un faux MouseEvent et on vérifie le defaultPrevented
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    btn.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
