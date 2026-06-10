/* @vitest-environment jsdom */
/**
 * Tests `EnvelopePerformanceTable` — cellule MWR (SPRINT 2).
 *
 * Vérifie l'affichage stacké valeur + libellé contextuel :
 *   - fenêtre courte (< 180 j) → valeur absolue + « sur N j » / « sur N mois »
 *   - fenêtre longue (≥ 180 j) → valeur annualisée + « annualisé »
 *   - mwrDisplay null → « — »
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

import { EnvelopePerformanceTable } from '../envelope-performance-table'
import type { EnvelopePerformance } from '@/lib/portfolio/envelope-performance'
import type { MwrDisplay } from '@/lib/portfolio/mwr-display'

afterEach(cleanup)

function env(over: Partial<EnvelopePerformance> = {}): EnvelopePerformance {
  return {
    envelopeId:       'e-' + Math.random().toString(36).slice(2, 8),
    envelopeLabel:    'PEA',
    currentValue:     1050,
    investedValue:    1000,
    unrealizedPnl:    50,
    unrealizedPnlPct: 5,
    realizedPnlTtm:   null,
    twr:              0.05,
    mwr:              2.5,
    mwrDisplay:       null,
    weightPct:        50,
    ...over,
  }
}

const annualized: MwrDisplay = { value: 0.12, isAnnualized: true, periodLabel: 'annualisé' }
const short14:    MwrDisplay = { value: 0.031, isAnnualized: false, periodLabel: 'sur 14 j' }

describe('EnvelopePerformanceTable — cellule MWR (SPRINT 2)', () => {
  it('< 2 enveloppes → ne se rend pas (null)', () => {
    const { container } = render(
      <EnvelopePerformanceTable data={[env()]} currency="EUR" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('fenêtre courte → valeur absolue + libellé « sur 14 j »', () => {
    render(
      <EnvelopePerformanceTable
        currency="EUR"
        data={[
          env({ envelopeLabel: 'Lucya',  mwrDisplay: short14 }),
          env({ envelopeLabel: 'PEA DR', mwrDisplay: annualized }),
        ]}
      />,
    )
    // +3,1 % (séparateur point ou virgule selon toFixed/Intl)
    expect(screen.getByText(/\+3[.,]1\s*%/)).toBeTruthy()
    expect(screen.getByText('sur 14 j')).toBeTruthy()
  })

  it('fenêtre longue → libellé « annualisé » affiché', () => {
    render(
      <EnvelopePerformanceTable
        currency="EUR"
        data={[
          env({ envelopeLabel: 'PEA DR', mwrDisplay: annualized }),
          env({ envelopeLabel: 'CTO',    mwrDisplay: annualized }),
        ]}
      />,
    )
    expect(screen.getAllByText('annualisé').length).toBeGreaterThanOrEqual(1)
  })

  it('mwrDisplay null → cellule « — »', () => {
    render(
      <EnvelopePerformanceTable
        currency="EUR"
        data={[
          env({ envelopeLabel: 'PEA DR', mwrDisplay: null }),
          env({ envelopeLabel: 'CTO',    mwrDisplay: null }),
        ]}
      />,
    )
    // au moins un tiret cadratin présent (cellules MWR vides + total)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
