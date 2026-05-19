/* @vitest-environment jsdom */
/**
 * Tests UI du simulateur de revente après la refonte multi-régimes.
 *
 * Couvre :
 *   - Sélecteur régime fiscal (particulier / lmnp / lmp / sci_is)
 *   - Apparition conditionnelle des champs (amortissements, CCA, CA LMP, TMI)
 *   - Avertissements régime (LF 2025, double imposition, etc.)
 *   - Durée jusqu'à « Dans 35 ans » dans le select
 *   - Affichage 3 scénarios SCI IS (Net SCI / Dividendes / CCA)
 *   - Affichage 2 lignes LMP (PV CT / PV LT)
 *   - Tableau comparatif inter-régimes (4 lignes)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

import {
  SimulationReventeModal, type SimulationReventeBien,
} from '../simulation-revente-modal'

function mkBien(over: Partial<SimulationReventeBien> = {}): SimulationReventeBien {
  return {
    id:             'bien-1',
    nom:            'Appart test',
    prixAchat:      200_000,
    dateAchat:      '2013-06-01',
    valeurActuelle: 300_000,
    typeUsage:      'locatif',
    regimeFiscal:   'particulier',
    ...over,
  }
}

function changeRegime(value: 'particulier' | 'lmnp' | 'lmp' | 'sci_is') {
  fireEvent.change(screen.getByLabelText(/Régime fiscal/i), { target: { value } })
}

function setPrix(prix = '300000') {
  fireEvent.change(screen.getByLabelText(/Prix de vente estimé/i), { target: { value: prix } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /^Simuler la revente$/i }))
}

describe('<SimulationReventeModal> — sélecteur régime', () => {
  afterEach(() => { cleanup() })

  it('régime particulier (par défaut) → pas de champ amortissements', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    expect(screen.getByLabelText(/Régime fiscal/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Amortissements cumulés/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Comptes courants/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/CA moyen sur 2 ans/i)).not.toBeInTheDocument()
  })

  it('sélection lmnp → champ amortissements + message LF 2025 visible', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    changeRegime('lmnp')
    expect(screen.getByLabelText(/Amortissements cumulés/i)).toBeInTheDocument()
    expect(screen.getByText(/Loi de finances 2025|amortissements sont réintégrés/i)).toBeInTheDocument()
    // Pas de CCA, pas de CA LMP en lmnp
    expect(screen.queryByLabelText(/Comptes courants/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/CA moyen sur 2 ans/i)).not.toBeInTheDocument()
  })

  it('sélection sci_is → amortissements + CCA + taux IS visibles', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    changeRegime('sci_is')
    expect(screen.getByLabelText(/Amortissements cumulés/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Comptes courants/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Taux IS/i)).toBeInTheDocument()
    // Message VNC base de calcul
    expect(screen.getByText(/VNC = prix achat − amortissements|amortissements augmentent/i)).toBeInTheDocument()
  })

  it('sélection lmp → amortissements + CA LMP + TMI visibles', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    changeRegime('lmp')
    expect(screen.getByLabelText(/Amortissements cumulés/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/CA moyen sur 2 ans/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Tranche marginale d'imposition/i)).toBeInTheDocument()
    expect(screen.getByText(/PV court terme|amortissements constituent/i)).toBeInTheDocument()
  })
})

describe('<SimulationReventeModal> — durées étendues', () => {
  afterEach(() => { cleanup() })

  it('Liste des durées contient "Dans 35 ans"', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    const select = screen.getByLabelText(/Date de cession envisagée/i) as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((o) => o.textContent ?? '')
    expect(optionLabels).toContain('Dans 35 ans')
    expect(optionLabels).toContain('Dans 30 ans')
    expect(optionLabels).toContain('Dans 25 ans')
    expect(optionLabels).toContain('Dans 20 ans')
    expect(optionLabels).toContain('Dans 15 ans')
    expect(optionLabels).toContain('Dans 10 ans')
  })
})

describe('<SimulationReventeModal> — affichage résultats par régime', () => {
  afterEach(() => { cleanup() })

  it('régime sci_is → 3 cartes scénarios (Net SCI / Dividendes / Avec CCA)', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    changeRegime('sci_is')
    // Renseigne des amortissements pour avoir une PV imposable réelle
    fireEvent.change(screen.getByLabelText(/Amortissements cumulés/i), {
      target: { value: '50000' },
    })
    setPrix('300000')
    submit()

    // Les 3 scénarios SCI IS sont présents
    expect(screen.getByText(/Net SCI après IS/i)).toBeInTheDocument()
    expect(screen.getByText(/^Dividendes$/i)).toBeInTheDocument()
    expect(screen.getByText(/Avec CCA optimisé/i)).toBeInTheDocument()
  })

  it('régime lmnp → bloc avertissement LF 2025 visible dans les résultats', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    changeRegime('lmnp')
    fireEvent.change(screen.getByLabelText(/Amortissements cumulés/i), {
      target: { value: '50000' },
    })
    setPrix('300000')
    submit()
    // Au moins un avertissement contient "loi de finances 2025" ou "amortissements"
    const matches = screen.getAllByText(/loi de finances 2025|amortissements/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('régime lmp → 2 lignes PV court terme / PV long terme', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    changeRegime('lmp')
    fireEvent.change(screen.getByLabelText(/Amortissements cumulés/i), {
      target: { value: '25000' },
    })
    fireEvent.change(screen.getByLabelText(/CA moyen sur 2 ans/i), {
      target: { value: '200000' }, // au-dessus de l'exo
    })
    setPrix('250000')
    submit()

    // Scope à la section "Décomposition LMP" pour éviter les collisions
    // avec les avertissements qui peuvent eux aussi mentionner "PV court terme".
    const titreLmp = screen.getByText(/Décomposition LMP/i)
    const section = titreLmp.closest('section')!
    expect(within(section).getByText(/PV court terme/i)).toBeInTheDocument()
    expect(within(section).getByText(/PV long terme/i)).toBeInTheDocument()
    expect(within(section).getByText(/12,8 %|PFU IR/i)).toBeInTheDocument()
  })
})

describe('<SimulationReventeModal> — tableau comparatif inter-régimes', () => {
  afterEach(() => { cleanup() })

  it('Affiche un tableau comparatif avec les 4 régimes', () => {
    render(<SimulationReventeModal bien={mkBien()} open onClose={() => {}} />)
    setPrix('300000')
    submit()

    const titre = screen.getByText(/Si tu avais choisi un autre régime/i)
    expect(titre).toBeInTheDocument()
    const section = titre.closest('section')!
    // Les 4 labels de régime apparaissent dans la section
    expect(within(section).getByText(/Particulier/i)).toBeInTheDocument()
    expect(within(section).getByText(/LMNP/i)).toBeInTheDocument()
    expect(within(section).getByText(/LMP/i)).toBeInTheDocument()
    expect(within(section).getByText(/SCI à l'IS/i)).toBeInTheDocument()
    // Le régime actuel (particulier) est marqué « ← actuel »
    expect(within(section).getByText(/← actuel/i)).toBeInTheDocument()
  })
})
