/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { QuickForm } from '../quick-form'

describe('<QuickForm>', () => {
  afterEach(() => { cleanup() })

  function renderForm() {
    const onSubmit = vi.fn()
    render(<QuickForm onSubmit={onSubmit} />)
    const ageInput   = screen.getByLabelText(/Âge/i) as HTMLInputElement
    const patInput   = screen.getByLabelText(/Patrimoine actuel/i) as HTMLInputElement
    const revInput   = screen.getByLabelText(/Revenu mensuel net/i) as HTMLInputElement
    const submitBtn  = screen.getByRole('button', { name: /Voir ma projection/i }) as HTMLButtonElement
    return { onSubmit, ageInput, patInput, revInput, submitBtn }
  }

  it('bouton désactivé au montage (3 champs vides)', () => {
    const { submitBtn } = renderForm()
    expect(submitBtn.disabled).toBe(true)
  })

  it('bouton désactivé si un seul champ est vide', () => {
    const { ageInput, patInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '32' } })
    fireEvent.change(patInput, { target: { value: '15000' } })
    // revenu vide → toujours désactivé
    expect(submitBtn.disabled).toBe(true)
  })

  it('bouton activé quand les 3 champs sont valides', () => {
    const { ageInput, patInput, revInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '32' } })
    fireEvent.change(patInput, { target: { value: '15000' } })
    fireEvent.change(revInput, { target: { value: '2500' } })
    expect(submitBtn.disabled).toBe(false)
  })

  it('revenu = 0 → bouton désactivé (revenu doit être strictement > 0)', () => {
    const { ageInput, patInput, revInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '32' } })
    fireEvent.change(patInput, { target: { value: '15000' } })
    fireEvent.change(revInput, { target: { value: '0' } })
    expect(submitBtn.disabled).toBe(true)
  })

  it('âge < 18 → bouton désactivé', () => {
    const { ageInput, patInput, revInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '15' } })
    fireEvent.change(patInput, { target: { value: '500' } })
    fireEvent.change(revInput, { target: { value: '1000' } })
    expect(submitBtn.disabled).toBe(true)
  })

  it('âge > 70 → bouton désactivé', () => {
    const { ageInput, patInput, revInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '75' } })
    fireEvent.change(patInput, { target: { value: '500' } })
    fireEvent.change(revInput, { target: { value: '1000' } })
    expect(submitBtn.disabled).toBe(true)
  })

  it('patrimoine = 0 → bouton activé (débutant Thomas est légitime)', () => {
    const { ageInput, patInput, revInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '28' } })
    fireEvent.change(patInput, { target: { value: '0' } })
    fireEvent.change(revInput, { target: { value: '2500' } })
    expect(submitBtn.disabled).toBe(false)
  })

  it('submit valide appelle onSubmit avec les 3 nombres parsés', () => {
    const { onSubmit, ageInput, patInput, revInput, submitBtn } = renderForm()
    fireEvent.change(ageInput, { target: { value: '32' } })
    fireEvent.change(patInput, { target: { value: '15000' } })
    fireEvent.change(revInput, { target: { value: '2500' } })
    // En jsdom, fireEvent.click sur un type="submit" ne déclenche pas
    // toujours le submit du form ; on cible le form directement.
    const form = submitBtn.closest('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledWith({
      age: 32, patrimoineActuel: 15000, revenuMensuelNet: 2500,
    })
  })
})
