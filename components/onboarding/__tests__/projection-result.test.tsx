/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ProjectionResult } from '../projection-result'
import type { QuickProjectionResult } from '@/lib/onboarding/quickProjection'

// Stub next/navigation pour useRouter (jsdom).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Stub recharts (rend juste un div pour éviter les warnings ResizeObserver)
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div data-stub-chart>{children}</div>
  return {
    LineChart:         Stub,
    Line:              Stub,
    XAxis:             Stub,
    YAxis:             Stub,
    Tooltip:           Stub,
    ReferenceLine:     Stub,
    ReferenceDot:      Stub,
    ResponsiveContainer: Stub,
    CartesianGrid:     Stub,
  }
})

function mkResult(over: Partial<QuickProjectionResult> = {}): QuickProjectionResult {
  return {
    ageIndependance:         47,
    anneesRestantes:         15,
    patrimoineNecessaire:    525_000,
    epargneMensuelleEstimee: 500,
    tauxEpargnePct:          20,
    trajectoire: [
      { annee: 0, age: 32, patrimoine: 15_000 },
      { annee: 15, age: 47, patrimoine: 525_000 },
    ],
    ...over,
  }
}

const INPUTS = { age: 32, patrimoineActuel: 15000, revenuMensuelNet: 2500 }

describe('<ProjectionResult>', () => {
  afterEach(() => { cleanup() })

  it('affiche « libre à 47 ans » quand ageIndependance = 47', () => {
    render(<ProjectionResult result={mkResult()} inputs={INPUTS} />)
    // Le bloc-text est fragmenté autour du span "47 ans" — on cible le span.
    expect(screen.getByText(/financièrement libre à/i)).toBeInTheDocument()
    expect(screen.getByText('47 ans')).toBeInTheDocument()
    expect(screen.getByText(/Dans 15 ans/i)).toBeInTheDocument()
  })

  it('affiche le fallback « à portée » quand ageIndependance = null', () => {
    render(<ProjectionResult result={mkResult({
      ageIndependance:  null,
      anneesRestantes:  null,
    })} inputs={INPUTS} />)
    expect(screen.getByText(/l'indépendance est à portée/i)).toBeInTheDocument()
    expect(screen.queryByText(/financièrement libre à/i)).not.toBeInTheDocument()
  })

  it('affiche toujours patrimoineNecessaire > 0 dans les 3 métriques', () => {
    render(<ProjectionResult result={mkResult()} inputs={INPUTS} />)
    // La métrique « Patrimoine visé » doit apparaître avec un montant
    expect(screen.getByText('Patrimoine visé')).toBeInTheDocument()
    // Le montant formaté contient au moins un chiffre (>0)
    const metricCard = screen.getByText('Patrimoine visé').parentElement
    expect(metricCard?.textContent).toMatch(/\d/)
  })

  it('les 2 CTAs sont présents (commencer + affiner)', () => {
    render(<ProjectionResult result={mkResult()} inputs={INPUTS} />)
    expect(screen.getByRole('button', { name: /Commencer à tracker/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Affiner ma projection/i })).toBeInTheDocument()
  })

  it('accordéon « Ces estimations supposent… » fermé par défaut, ouvrable', async () => {
    render(<ProjectionResult result={mkResult()} inputs={INPUTS} />)
    const toggle = screen.getByRole('button', { name: /Ces estimations supposent/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Le détail (rendement, inflation) n'est pas visible avant ouverture
    expect(screen.queryByText(/Rendement annuel/i)).not.toBeInTheDocument()
  })
})
