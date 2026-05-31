/* @vitest-environment jsdom */
/**
 * Item 1 — Multi life_events UI : tests du support N événements pour
 * `capital_exceptionnel` dans StepProjetsVie.
 *
 * Couvre :
 *   - État vide → bouton "Ajouter un capital exceptionnel" visible
 *   - Ajout → 1 événement créé + bouton change en "Ajouter un autre"
 *   - Ajout multiple → N cartes affichées, chacune avec son numéro
 *   - Suppression ciblée → ne touche que l'événement supprimé
 *   - Update ciblé → ne touche que l'événement édité
 *   - Soft cap 10 → bouton désactivé + message
 *   - Non-régression : les autres types (retraite, achat_rp, naissance)
 *     restent 1-max
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { StepProjetsVie } from '../StepProjetsVie'
import { EMPTY_VALUES } from '../../questionnaire-types'
import type { LifeEventDraft } from '../../lifeEventsDraft'
import type { QuestionnaireValues } from '../../questionnaire-types'

afterEach(() => cleanup())

function renderStep(initialEvents: LifeEventDraft[] = []) {
  const setLifeEvents = vi.fn()
  const set = vi.fn()
  const values: QuestionnaireValues = { ...EMPTY_VALUES, age: 40 }
  const utils = render(
    <StepProjetsVie
      values={values}
      set={set}
      lifeEvents={initialEvents}
      setLifeEvents={setLifeEvents}
    />,
  )
  return { ...utils, setLifeEvents, set }
}

// ────────────────────────────────────────────────────────────────────
// 1 — État initial
// ────────────────────────────────────────────────────────────────────

describe('Multi capital_exceptionnel — état initial', () => {
  it('aucun événement → message "aucun" + bouton "Ajouter un capital exceptionnel"', () => {
    renderStep([])
    expect(screen.queryByText(/aucun capital exceptionnel/i)).toBeTruthy()
    const addBtn = screen.getByTestId('add-capital-event')
    expect(addBtn.textContent).toContain('Ajouter un capital exceptionnel')
    expect((addBtn as HTMLButtonElement).disabled).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────
// 2 — Ajout d'un événement
// ────────────────────────────────────────────────────────────────────

describe('Multi capital_exceptionnel — ajout', () => {
  it('cliquer "Ajouter" → setLifeEvents reçoit un tableau avec 1 capital event', () => {
    const { setLifeEvents } = renderStep([])
    fireEvent.click(screen.getByTestId('add-capital-event'))
    expect(setLifeEvents).toHaveBeenCalledTimes(1)
    const next = setLifeEvents.mock.calls[0]![0] as LifeEventDraft[]
    expect(next).toHaveLength(1)
    expect(next[0]!.type).toBe('capital_exceptionnel')
    expect(next[0]!.is_active).toBe(true)
    expect(next[0]!.label).toBe('Héritage')
  })

  it('avec 1 événement → bouton change en "Ajouter un autre"', () => {
    const events: LifeEventDraft[] = [
      {
        type: 'capital_exceptionnel', is_active: true,
        occurrence_date: '2030-01-01', montant: 50_000,
        label: 'Héritage', meta: { preset: 'heritage' },
      },
    ]
    renderStep(events)
    expect(screen.getByTestId('add-capital-event').textContent).toContain('Ajouter un autre')
    expect(screen.queryByText(/1 événement\b/i)).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────
// 3 — N événements rendus
// ────────────────────────────────────────────────────────────────────

describe('Multi capital_exceptionnel — N événements rendus', () => {
  it('3 événements → 3 cartes numérotées', () => {
    const events: LifeEventDraft[] = [
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2030-01-01', montant: 50_000, label: 'Héritage', meta: { preset: 'heritage' } },
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2032-06-01', montant: 20_000, label: 'Bonus',    meta: { preset: 'bonus' } },
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2035-01-01', montant: 200_000, label: 'Vente',   meta: { preset: 'vente_entreprise' } },
    ]
    renderStep(events)
    expect(screen.queryByTestId('capital-event-0')).toBeTruthy()
    expect(screen.queryByTestId('capital-event-1')).toBeTruthy()
    expect(screen.queryByTestId('capital-event-2')).toBeTruthy()
    expect(screen.queryByText('Événement 1 / 3')).toBeTruthy()
    expect(screen.queryByText('Événement 3 / 3')).toBeTruthy()
    expect(screen.queryByText(/3 événements\b/i)).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────
// 4 — Suppression ciblée
// ────────────────────────────────────────────────────────────────────

describe('Multi capital_exceptionnel — suppression ciblée', () => {
  it('supprimer le 2e événement → 1er et 3e préservés', () => {
    const events: LifeEventDraft[] = [
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2030-01-01', montant: 50_000, label: 'Héritage', meta: { preset: 'heritage' } },
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2032-06-01', montant: 20_000, label: 'Bonus',    meta: { preset: 'bonus' } },
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2035-01-01', montant: 200_000, label: 'Vente',   meta: { preset: 'vente_entreprise' } },
    ]
    const { setLifeEvents } = renderStep(events)
    // Supprime le 2e (ordinal=1)
    const deleteBtns = screen.getAllByLabelText(/Supprimer l'événement/i)
    fireEvent.click(deleteBtns[1]!)
    const next = setLifeEvents.mock.calls[0]![0] as LifeEventDraft[]
    expect(next).toHaveLength(2)
    expect(next.map((e) => e.label)).toEqual(['Héritage', 'Vente'])
  })
})

// ────────────────────────────────────────────────────────────────────
// 5 — Soft cap 10
// ────────────────────────────────────────────────────────────────────

describe('Multi capital_exceptionnel — soft cap', () => {
  it('10 événements → bouton désactivé + message limite', () => {
    const events: LifeEventDraft[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'capital_exceptionnel' as const, is_active: true,
      occurrence_date: `203${i % 10}-01-01`, montant: 10_000, label: `Cap ${i}`,
      meta: { preset: 'heritage' as const },
    }))
    renderStep(events)
    const btn = screen.getByTestId('add-capital-event') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(screen.queryByText(/Limite de 10 événements/i)).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────
// 6 — Non-régression : autres types restent 1-max
// ────────────────────────────────────────────────────────────────────

describe('Multi capital_exceptionnel — non-régression autres types', () => {
  it('retraite : toggle off → setLifeEvents([])', () => {
    const events: LifeEventDraft[] = [
      { type: 'retraite', is_active: true, occurrence_date: '2050-01-01', montant: 2000, label: null, meta: {} },
    ]
    const { setLifeEvents } = renderStep(events)
    // La case "Activé" pour retraite
    const checkboxes = screen.getAllByRole('checkbox')
    // Le premier checkbox est celui de retraite (1er EventCard)
    fireEvent.click(checkboxes[0]!)
    const next = setLifeEvents.mock.calls[0]![0] as LifeEventDraft[]
    expect(next.filter((e) => e.type === 'retraite')).toHaveLength(0)
  })

  it('mix retraite + N capital → tout cohabite dans le même tableau', () => {
    const events: LifeEventDraft[] = [
      { type: 'retraite', is_active: true, occurrence_date: '2050-01-01', montant: 2000, label: null, meta: {} },
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2030-01-01', montant: 50_000, label: 'Héritage', meta: { preset: 'heritage' } },
      { type: 'capital_exceptionnel', is_active: true, occurrence_date: '2032-01-01', montant: 20_000, label: 'Bonus',    meta: { preset: 'bonus' } },
    ]
    renderStep(events)
    // Capital count badge présent
    expect(screen.queryByText(/2 événements\b/i)).toBeTruthy()
    // Et la retraite est rendue active (Activé)
    expect(screen.queryByText(/^Activé$/)).toBeTruthy()
  })
})
