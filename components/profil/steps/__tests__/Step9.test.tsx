/* @vitest-environment jsdom */
/**
 * CS1 — Tests du Step9 « Ta fiscalité » du wizard profil.
 *
 * Couvre :
 *   1. Rendu des 6 chips (0/11/30/41/45/Je ne sais pas).
 *   2. Sélection d'une chip → écrit la valeur attendue.
 *   3. Chip « Je ne sais pas » → écrit null.
 *   4. Pré-remplissage : `tmi_rate=30` à l'init → la chip 30 est marquée
 *      `aria-pressed="true"`.
 *   5. Mention pédagogique et tooltip InfoTip présents.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Step9 } from '../Step9'
import { EMPTY_VALUES, type QuestionnaireValues } from '../../questionnaire-types'

afterEach(() => { cleanup() })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySet = any

function harness(initial: Partial<QuestionnaireValues> = {}) {
  const store: QuestionnaireValues = { ...EMPTY_VALUES, ...initial }
  const set = vi.fn(<K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => {
    store[k] = v
  })
  return { store, set: set as AnySet }
}

describe('Step9 — Ta fiscalité (CS1)', () => {
  it('rend les 6 chips attendues', () => {
    const { store, set } = harness()
    render(<Step9 values={store} set={set} />)
    for (const label of ['0 %', '11 %', '30 %', '41 %', '45 %', 'Je ne sais pas']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('clic sur la chip 41 % écrit tmi_rate = 41', () => {
    const { set } = harness()
    render(<Step9 values={EMPTY_VALUES} set={set} />)
    fireEvent.click(screen.getByRole('button', { name: '41 %' }))
    expect(set).toHaveBeenCalledWith('tmi_rate', 41)
  })

  it('clic sur « Je ne sais pas » écrit tmi_rate = null', () => {
    const { set } = harness({ tmi_rate: 30 })
    render(<Step9 values={{ ...EMPTY_VALUES, tmi_rate: 30 }} set={set} />)
    fireEvent.click(screen.getByRole('button', { name: 'Je ne sais pas' }))
    expect(set).toHaveBeenCalledWith('tmi_rate', null)
  })

  it('pré-remplissage : tmi_rate=30 → la chip 30 est aria-pressed=true', () => {
    const { set } = harness({ tmi_rate: 30 })
    render(<Step9 values={{ ...EMPTY_VALUES, tmi_rate: 30 }} set={set} />)
    expect(screen.getByRole('button', { name: '30 %' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '41 %' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tmi_rate=null → « Je ne sais pas » est aria-pressed=true + hint affiché', () => {
    const { set } = harness({ tmi_rate: null })
    render(<Step9 values={{ ...EMPTY_VALUES, tmi_rate: null }} set={set} />)
    expect(screen.getByRole('button', { name: 'Je ne sais pas' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Estimation 30/i)).toBeInTheDocument()
  })

  it('mention pédagogique + tooltip TMI présents', () => {
    const { set } = harness()
    render(<Step9 values={EMPTY_VALUES} set={set} />)
    expect(screen.getByText(/calibrer précisément/i)).toBeInTheDocument()
    // InfoTip rend un bouton aria-label commençant par "Aide :"
    expect(screen.getByRole('button', { name: /Aide\s*:/i })).toBeInTheDocument()
  })
})
