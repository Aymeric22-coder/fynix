/* @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { TropheesCard } from '../trophees-card'
import type { JalonFIRE } from '@/types/analyse'

function makeJalon(valeur: number, atteint: boolean, dateIso?: string): JalonFIRE {
  return {
    age:    0,
    label:  `${(valeur / 1000).toFixed(0)} k€`,
    type:   'milestone',
    valeur,
    atteint,
    date_atteinte: atteint ? dateIso : undefined,
  }
}

describe('<TropheesCard>', () => {
  afterEach(() => { cleanup() })

  it('ne rend rien si aucun jalon atteint', () => {
    const { container } = render(
      <TropheesCard jalons={[makeJalon(10000, false), makeJalon(50000, false)]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche un badge par jalon atteint avec sa date', () => {
    const jalons: JalonFIRE[] = [
      makeJalon(10_000, true, '2024-03-15'),
      makeJalon(50_000, true, '2024-08-22'),
      makeJalon(100_000, false),
    ]
    render(<TropheesCard jalons={jalons} />)

    // Le titre est présent
    expect(screen.getByText(/jalons franchis/i)).toBeInTheDocument()
    // Compteur 2 sur 3
    expect(screen.getByText('(2 sur 3)')).toBeInTheDocument()
    // Les 2 montants atteints sont visibles (matcher ancré pour éviter
    // qu'un "10 000" matche par sous-chaîne d'un "100 000")
    const findMontant = (n: number) =>
      screen.getByText(new RegExp(`^${n.toLocaleString('fr-FR').replace(/\s/g, '[\\s\\u00a0\\u202f]')}[\\s\\u00a0\\u202f]*€$`))
    expect(findMontant(10_000)).toBeInTheDocument()
    expect(findMontant(50_000)).toBeInTheDocument()
    // Mois courts dans les badges (août 2024, mars 2024)
    expect(screen.getByText(/août 2024/)).toBeInTheDocument()
    expect(screen.getByText(/mars 2024/)).toBeInTheDocument()
    // Pas de chip « + autres » avec 2 badges seulement
    expect(screen.queryByText(/autre/i)).not.toBeInTheDocument()
  })

  it('affiche 4 badges + « +2 autres » quand 6 jalons atteints', () => {
    const jalons: JalonFIRE[] = [
      makeJalon(10_000,  true, '2024-01-01'),
      makeJalon(25_000,  true, '2024-03-01'),
      makeJalon(50_000,  true, '2024-06-01'),
      makeJalon(100_000, true, '2024-09-01'),
      makeJalon(250_000, true, '2025-02-01'),
      makeJalon(500_000, true, '2025-07-01'),
    ]
    render(<TropheesCard jalons={jalons} />)

    // Les 4 plus récents : 500k, 250k, 100k, 50k — on cible le span monétaire
    // exact (formatEur produit "500 000 €" avec espaces fins). On utilise une
    // regex ancrée pour éviter les faux positifs (ex: "50 000" inclus dans "250 000").
    const findMontant = (n: number) =>
      screen.getByText(new RegExp(`^${n.toLocaleString('fr-FR').replace(/\s/g, '[\\s\\u00a0\\u202f]')}[\\s\\u00a0\\u202f]*€$`))
    expect(findMontant(500_000)).toBeInTheDocument()
    expect(findMontant(250_000)).toBeInTheDocument()
    expect(findMontant(100_000)).toBeInTheDocument()
    expect(findMontant(50_000)).toBeInTheDocument()
    // Les 2 plus anciens NE doivent PAS être visibles comme badges (10k, 25k)
    expect(screen.queryByText(/^10[\s  ]000[\s  ]*€$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^25[\s  ]000[\s  ]*€$/)).not.toBeInTheDocument()
    // Chip de débordement « +2 autres »
    expect(screen.getByText('+2 autres')).toBeInTheDocument()
  })
})
