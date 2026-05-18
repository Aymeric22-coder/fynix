/**
 * Formulaire onboarding 60s — 3 inputs strictement.
 *
 * - Validation en temps réel (le bouton se débloque uniquement quand
 *   les 3 champs sont valides : age 18-70, patrimoine ≥ 0, revenu > 0).
 * - Autofocus sur le 1er input au montage.
 * - Enter sur n'importe quel champ → soumet si valide.
 * - Aucune animation lourde (vitesse perçue avant tout).
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'

export interface QuickFormData {
  age:              number
  patrimoineActuel: number
  revenuMensuelNet: number
}

interface Props {
  onSubmit: (data: QuickFormData) => void
}

interface FieldState {
  age:              string
  patrimoineActuel: string
  revenuMensuelNet: string
}

const EMPTY: FieldState = { age: '', patrimoineActuel: '', revenuMensuelNet: '' }

function parsePositiveInt(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function validate(state: FieldState): QuickFormData | null {
  const age = parsePositiveInt(state.age)
  const pat = parsePositiveInt(state.patrimoineActuel)
  const rev = parsePositiveInt(state.revenuMensuelNet)
  if (age === null || age < 18 || age > 70) return null
  if (pat === null) return null
  if (rev === null || rev <= 0) return null
  return { age, patrimoineActuel: pat, revenuMensuelNet: rev }
}

export function QuickForm({ onSubmit }: Props) {
  const [state, setState] = useState<FieldState>(EMPTY)
  const firstInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  const valid = validate(state)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (valid) onSubmit(valid)
  }

  function update<K extends keyof FieldState>(k: K, v: string) {
    setState((prev) => ({ ...prev, [k]: v }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Headline */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary leading-tight">
          Découvre quand tu pourrais être financièrement libre
        </h1>
        <p className="text-sm text-secondary">3 questions, moins d&apos;une minute.</p>
      </div>

      {/* Input 1 — Âge */}
      <Field
        label="Quel est ton âge ?"
        htmlFor="age"
      >
        <input
          ref={firstInputRef}
          id="age"
          name="age"
          type="number"
          inputMode="numeric"
          min={18}
          max={70}
          step={1}
          placeholder="32"
          value={state.age}
          onChange={(e) => update('age', e.target.value)}
          className={inputCls}
          aria-label="Âge"
        />
      </Field>

      {/* Input 2 — Patrimoine */}
      <Field
        label="Combien as-tu d'épargne et d'investissements ?"
        hint="Livret A, actions, crypto, valeur de tes biens… Ordre de grandeur, pas besoin d'être précis."
        htmlFor="patrimoine"
        suffix="€"
      >
        <input
          id="patrimoine"
          name="patrimoineActuel"
          type="number"
          inputMode="decimal"
          min={0}
          step={100}
          placeholder="15000"
          value={state.patrimoineActuel}
          onChange={(e) => update('patrimoineActuel', e.target.value)}
          className={inputCls}
          aria-label="Patrimoine actuel"
        />
      </Field>

      {/* Input 3 — Revenu */}
      <Field
        label="Quel est ton revenu mensuel net ?"
        hint="Ton salaire après impôts."
        htmlFor="revenu"
        suffix="€/mois"
      >
        <input
          id="revenu"
          name="revenuMensuelNet"
          type="number"
          inputMode="decimal"
          min={1}
          step={50}
          placeholder="2500"
          value={state.revenuMensuelNet}
          onChange={(e) => update('revenuMensuelNet', e.target.value)}
          className={inputCls}
          aria-label="Revenu mensuel net"
        />
      </Field>

      {/* CTA */}
      <div className="space-y-3">
        <button
          type="submit"
          disabled={!valid}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg
                     bg-accent text-white font-semibold text-base
                     hover:bg-accent-hover transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Voir ma projection
          <ArrowRight size={18} />
        </button>
        <p className="text-center text-xs text-muted">
          Aucune donnée bancaire requise · Tu pourras affiner ensuite
        </p>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants & styles
// ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full bg-surface-2 border border-border rounded-lg px-3.5 py-3 text-base text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors'

function Field({ label, hint, htmlFor, suffix, children }: {
  label:    string
  hint?:    string
  htmlFor:  string
  suffix?:  string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-primary">
        {label}
      </label>
      {hint && <p className="text-xs text-muted leading-relaxed">{hint}</p>}
      <div className="relative">
        {children}
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
