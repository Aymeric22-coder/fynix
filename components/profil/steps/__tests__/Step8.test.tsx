/* @vitest-environment jsdom */
/**
 * QW8 — Tests du toggle "Montant" ↔ "% de mon revenu" sur l'input
 * `revenu_passif_cible` de Step8.
 *
 * Vérifie :
 *   1. Toggle présent, 2 modes accessibles, "Montant" actif par défaut.
 *   2. Mode % avec revenuTotal=5000 + 70 % → revenu_passif_cible=3500.
 *   3. Mode % avec revenuTotal=5000 + 80 % → revenu_passif_cible=4000.
 *   4. Bascule Montant → % avec cible=3500 et revenuTotal=5000 → input % = 70.
 *   5. revenuTotal=0 → bouton "%" désactivé + hint affiché. Mode Montant
 *      reste pleinement utilisable.
 *   6. Non-régression : l'utilisateur qui ne touche pas au toggle a le
 *      comportement legacy (input direct €/mois écrit dans revenu_passif_cible).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { Step8 } from '../Step8'
import { EMPTY_VALUES, type QuestionnaireValues } from '../../questionnaire-types'

afterEach(() => { cleanup() })

/** Fabrique des valeurs initiales + un mock `set` qui mute un store local. */
function makeHarness(initial: Partial<QuestionnaireValues> = {}) {
  const store: QuestionnaireValues = { ...EMPTY_VALUES, ...initial }
  const set = vi.fn(<K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => {
    store[k] = v
  })
  return { store, set }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySet = any   // pour préserver la généricité du `set` de Step8 dans les tests

/** Rerender helper : Step8 lit `values` par référence, donc on remonte le
 *  composant à chaque mutation du store pour simuler le parent qui reflow. */
function renderStep8(store: QuestionnaireValues, set: AnySet) {
  return render(<Step8 values={store} set={set} />)
}

/** Récupère le bouton du segmented control par son libellé. */
function getToggleBtn(label: 'Montant' | '% de mon revenu') {
  return screen.getByRole('tab', { name: new RegExp(label.replace('%', '%'), 'i') })
}

describe('Step8 — toggle revenu_passif_cible (QW8)', () => {
  it('par défaut : mode "Montant" actif, input direct €/mois', () => {
    const { store, set } = makeHarness({ revenu_mensuel: 5000 })
    renderStep8(store, set)
    expect(getToggleBtn('Montant')).toHaveAttribute('aria-selected', 'true')
    expect(getToggleBtn('% de mon revenu')).toHaveAttribute('aria-selected', 'false')
    // L'input €/mois est présent
    expect(screen.getByLabelText(/Revenu passif mensuel cible en euros/i)).toBeInTheDocument()
  })

  it('mode % avec revenuTotal=5000 + 70 % → revenu_passif_cible=3500', () => {
    const { store, set } = makeHarness({ revenu_mensuel: 5000 })
    renderStep8(store, set)
    fireEvent.click(getToggleBtn('% de mon revenu'))
    // L'input % apparaît (init à 70 % par défaut)
    const percentInput = screen.getByLabelText(/Cible en pourcentage/i)
    expect(percentInput).toHaveValue(70)
    // Le passage en mode % a écrit 3500 dans revenu_passif_cible
    expect(set).toHaveBeenCalledWith('revenu_passif_cible', 3500)
  })

  it('mode % : changer le % à 80 → revenu_passif_cible=4000', () => {
    const { store, set } = makeHarness({ revenu_mensuel: 5000 })
    renderStep8(store, set)
    fireEvent.click(getToggleBtn('% de mon revenu'))
    const percentInput = screen.getByLabelText(/Cible en pourcentage/i)
    fireEvent.change(percentInput, { target: { value: '80' } })
    expect(set).toHaveBeenLastCalledWith('revenu_passif_cible', 4000)
  })

  it('bascule Montant → %, init % dérivé de la cible existante (3500 / 5000 → 70)', () => {
    const { store, set } = makeHarness({
      revenu_mensuel: 5000,
      revenu_passif_cible: 3500,
    })
    renderStep8(store, set)
    fireEvent.click(getToggleBtn('% de mon revenu'))
    const percentInput = screen.getByLabelText(/Cible en pourcentage/i)
    expect(percentInput).toHaveValue(70)
    // Pas d'écrasement de la cible — elle vaut déjà 3500
    expect(set).not.toHaveBeenCalled()
  })

  it('revenuTotal=0 → bouton "%" disabled + hint affiché, mode Montant utilisable', () => {
    const { store, set } = makeHarness({ revenu_mensuel: 0 })
    renderStep8(store, set)
    const pctBtn = getToggleBtn('% de mon revenu')
    expect(pctBtn).toBeDisabled()
    expect(screen.getByText(/Renseigne tes revenus à l'étape 2/i)).toBeInTheDocument()
    // Mode Montant reste utilisable
    const montantInput = screen.getByLabelText(/Revenu passif mensuel cible en euros/i)
    fireEvent.change(montantInput, { target: { value: '2500' } })
    expect(set).toHaveBeenLastCalledWith('revenu_passif_cible', 2500)
  })

  it('non-régression : sans toucher au toggle, saisie €/mois directe écrite tel quel', () => {
    const { store, set } = makeHarness({ revenu_mensuel: 5000 })
    renderStep8(store, set)
    // L'utilisateur tape directement dans l'input Montant (mode par défaut)
    const montantInput = screen.getByLabelText(/Revenu passif mensuel cible en euros/i)
    fireEvent.change(montantInput, { target: { value: '4200' } })
    expect(set).toHaveBeenLastCalledWith('revenu_passif_cible', 4200)
  })

  it('revenu_mensuel_total = revenu_mensuel + revenu_conjoint + autres_revenus', () => {
    // 3000 + 2000 + 500 = 5500. 70 % → 3850.
    const { store, set } = makeHarness({
      revenu_mensuel: 3000, revenu_conjoint: 2000, autres_revenus: 500,
    })
    renderStep8(store, set)
    fireEvent.click(getToggleBtn('% de mon revenu'))
    // 70 % × 5500 = 3850
    expect(set).toHaveBeenCalledWith('revenu_passif_cible', Math.round(0.7 * 5500))
  })
})
