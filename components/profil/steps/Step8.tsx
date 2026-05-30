/**
 * Étape 8 — Profil de risque & objectif FIRE.
 * - 4 questions comportementales (radios)
 * - Sélection du type de FIRE (cartes cliquables)
 * - Revenu passif cible + âge cible + priorité principale
 *
 * QW8 — Le champ `revenu_passif_cible` est saisi via un toggle deux modes
 * équivalents : "Montant" (€/mois direct) et "% de mon revenu" (calcul à
 * partir de revenu_mensuel_total). La valeur STOCKÉE reste toujours en
 * €/mois — le mode % est un confort de saisie local au formulaire.
 */
'use client'

import { useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils/format'
import { Field, Input, FormGrid } from '@/components/ui/field'
import { Chip } from '../Chip'
import { FIRE_TYPES, PRIORITES, RISK_QUESTIONS } from '@/lib/profil/calculs'
import { QUICK_HYPOTHESES } from '@/lib/onboarding/quickProjection'
import type { QuestionnaireValues } from '../questionnaire-types'

/** Pourcentage par défaut quand on bascule en mode "%" sans valeur existante.
 *  Importé depuis QUICK_HYPOTHESES.revenuCible (= 0.70 → 70 %) pour rester
 *  aligné avec l'hypothèse de l'onboarding 60 s. */
const DEFAULT_PERCENT = Math.round(QUICK_HYPOTHESES.revenuCible * 100)

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step8({ values, set }: Props) {
  return (
    <div className="space-y-7">
      {/* Questions de risque */}
      <div className="space-y-6">
        {RISK_QUESTIONS.map(({ key, q, opts }) => (
          <div key={key} className="space-y-2">
            <p className="text-sm text-primary">{q}</p>
            <div className="space-y-2">
              {opts.map(({ v, l }) => {
                const selected = values[key] === v
                return (
                  <button
                    type="button"
                    key={v}
                    onClick={() => set(key, v)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-lg border transition-colors',
                      selected
                        ? 'border-accent bg-accent-muted'
                        : 'border-border bg-surface-2 hover:border-border-2',
                    )}
                  >
                    <span className={cn(
                      'flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center',
                      selected ? 'border-accent' : 'border-muted',
                    )}>
                      {selected && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </span>
                    <span className={cn('text-sm', selected ? 'text-primary' : 'text-secondary')}>{l}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Type de FIRE */}
      <div className="space-y-3 pt-4 border-t border-border">
        <p className="text-xs text-secondary uppercase tracking-widest">Type d&apos;indépendance visé</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIRE_TYPES.map((f) => {
            const selected = values.fire_type === f.id
            return (
              <button
                type="button"
                key={f.id}
                onClick={() => set('fire_type', f.id)}
                className={cn(
                  'text-left px-4 py-3 rounded-lg border transition-colors',
                  selected
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-surface-2 hover:border-border-2',
                )}
              >
                <p className={cn('text-sm font-medium', selected ? 'text-accent' : 'text-primary')}>{f.name}</p>
                <p className="text-xs text-secondary mt-0.5 leading-relaxed">{f.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <FormGrid>
        <RevenuPassifCibleInput values={values} set={set} />
        <Field label="Âge cible d'indépendance">
          <Input
            type="number" min={0} max={120} placeholder="45"
            value={values.age_cible ?? ''}
            onChange={(e) => set('age_cible', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
      </FormGrid>

      <Field label="Priorité principale">
        <div className="flex flex-wrap gap-2">
          {PRIORITES.map((v) => (
            <Chip key={v} active={values.priorite === v} onClick={() => set('priorite', v)}>
              {v}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// QW8 — Sous-composant : input revenu_passif_cible avec toggle deux modes
// ────────────────────────────────────────────────────────────────────

interface RevenuPassifCibleInputProps {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

/**
 * Toggle "Montant" (€/mois direct) ↔ "% de mon revenu" (calcul à partir de
 * revenu_mensuel_total). La valeur écrite dans `revenu_passif_cible` reste
 * toujours en €/mois — le mode % est un confort de saisie.
 *
 * Cas dégradés :
 *   - revenu_mensuel_total <= 0 : le bouton "%" est désactivé (hint affiché),
 *     le mode "Montant" reste pleinement utilisable.
 *
 * Init du % : si revenu_passif_cible et revenu_mensuel_total sont déjà
 * connus, on dérive le ratio actuel ; sinon DEFAULT_PERCENT (70 %).
 */
function RevenuPassifCibleInput({ values, set }: RevenuPassifCibleInputProps) {
  const revenuTotal =
    (values.revenu_mensuel  ?? 0) +
    (values.revenu_conjoint ?? 0) +
    (values.autres_revenus  ?? 0)
  const percentDisabled = revenuTotal <= 0

  const [mode, setMode] = useState<'montant' | 'percent'>('montant')

  // % courant déduit de la valeur actuelle (si possible), sinon 70 %.
  const derivedPercent = (() => {
    const cible = values.revenu_passif_cible ?? 0
    if (cible > 0 && revenuTotal > 0) return Math.round((cible / revenuTotal) * 100)
    return DEFAULT_PERCENT
  })()
  const [percent, setPercent] = useState<number>(derivedPercent)

  /** Bascule de mode. En entrée dans "%", on synchronise `percent` avec la
   *  valeur actuelle de revenu_passif_cible pour ne pas réinitialiser à 70. */
  function switchMode(next: 'montant' | 'percent') {
    if (next === 'percent') {
      const cible = values.revenu_passif_cible ?? 0
      if (cible > 0 && revenuTotal > 0) {
        setPercent(Math.round((cible / revenuTotal) * 100))
      } else {
        setPercent(DEFAULT_PERCENT)
        // Initialise revenu_passif_cible au défaut si vide, pour que le mode
        // % soit cohérent dès l'entrée (sinon l'utilisateur voit "0 €/mois").
        if (cible === 0 && revenuTotal > 0) {
          set('revenu_passif_cible', Math.round((DEFAULT_PERCENT / 100) * revenuTotal))
        }
      }
    }
    setMode(next)
  }

  function handlePercentChange(p: number) {
    setPercent(p)
    set('revenu_passif_cible', Math.round((p / 100) * revenuTotal))
  }

  const cibleCalcule = Math.round((percent / 100) * revenuTotal)

  return (
    <div className="space-y-2">
      {/* Header : label + segmented control */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-sm text-secondary">Revenu passif mensuel cible</label>
        <div
          role="tablist"
          aria-label="Mode de saisie de la cible"
          className="inline-flex rounded-md border border-border overflow-hidden text-[11px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'montant'}
            onClick={() => switchMode('montant')}
            className={cn(
              'px-2.5 py-1 transition-colors',
              mode === 'montant'
                ? 'bg-accent-muted text-accent'
                : 'text-secondary hover:text-primary',
            )}
          >
            Montant
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'percent'}
            onClick={() => switchMode('percent')}
            disabled={percentDisabled}
            title={percentDisabled
              ? 'Renseigne tes revenus à l\'étape 2 pour utiliser le mode %'
              : undefined}
            className={cn(
              'px-2.5 py-1 border-l border-border transition-colors',
              mode === 'percent' && !percentDisabled
                ? 'bg-accent-muted text-accent'
                : 'text-secondary hover:text-primary',
              percentDisabled && 'opacity-40 cursor-not-allowed hover:text-secondary',
            )}
          >
            % de mon revenu
          </button>
        </div>
      </div>

      {/* Input du mode actif */}
      {mode === 'montant' || percentDisabled ? (
        <Input
          type="number" min={0} placeholder="4 000"
          value={values.revenu_passif_cible ?? ''}
          onChange={(e) => set('revenu_passif_cible', e.target.value ? Number(e.target.value) : null)}
          aria-label="Revenu passif mensuel cible en euros"
        />
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <Input
              type="number" min={0} max={200} placeholder="70"
              value={percent}
              onChange={(e) => handlePercentChange(e.target.value ? Number(e.target.value) : 0)}
              aria-label="Cible en pourcentage du revenu mensuel"
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">
              %
            </span>
          </div>
          <p className="text-[11px] text-muted financial-value">
            ≈ {formatCurrency(cibleCalcule, 'EUR', { decimals: 0 })}/mois
          </p>
        </div>
      )}

      {/* Hint si mode % désactivé */}
      {percentDisabled && (
        <p className="text-[11px] text-muted leading-relaxed">
          Renseigne tes revenus à l&apos;étape 2 pour utiliser le mode «&nbsp;%&nbsp;».
        </p>
      )}
    </div>
  )
}
