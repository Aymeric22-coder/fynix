/**
 * DismissAlertModal — Modal de masquage d'une alerte ou recommandation
 * (V2.2-BIS ST4).
 *
 * Permet à l'utilisateur de :
 *   1. Choisir une raison parmi un set fermé
 *   2. Ajouter une note libre (optionnel)
 *   3. Choisir une durée : 6 mois ou définitif
 *
 * À la validation, insère / upsert dans la table `user_alert_dismissals`
 * puis rafraîchit la page (Server Component → re-fetch automatique).
 *
 * Layout : 1 écran simple, pas de wizard (cf. contrainte V2.2-BIS).
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export type DismissReasonCode =
  | 'strategie_personnelle'
  | 'temporaire'
  | 'pro_specialiste'
  | 'reco_irrealiste'
  | 'autre'

interface ReasonOption {
  code:  DismissReasonCode
  label: string
}

/** Variantes selon le type d'item masqué (alerte vs reco). Permet d'adapter
 *  la liste de raisons (ex: `reco_irrealiste` n'a de sens que pour une reco). */
const REASONS_ALERTE: ReasonOption[] = [
  { code: 'strategie_personnelle', label: 'C’est ma stratégie patrimoniale assumée' },
  { code: 'temporaire',            label: 'C’est une situation temporaire'                  },
  { code: 'pro_specialiste',       label: 'Je suis spécialisé sur cette classe d’actif'   },
  { code: 'autre',                 label: 'Autre raison'                                          },
]
const REASONS_RECO: ReasonOption[] = [
  ...REASONS_ALERTE.slice(0, 3),
  { code: 'reco_irrealiste',  label: 'Cette recommandation n’est pas réaliste pour moi' },
  { code: 'autre',            label: 'Autre raison'                                                },
]

interface Props {
  open:        boolean
  onClose:     () => void
  /** Signature unique stockée en DB (cf. calc.ts + recoMensuelles.ts). */
  signature:   string
  /** Type d'item — détermine le titre + les raisons proposées. */
  kind:        'alert' | 'reco'
  /** Texte original de l'alerte/reco — rappelé à l'utilisateur. */
  preview:     string
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000   // approx 6 mois

export function DismissAlertModal({ open, onClose, signature, kind, preview }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const reasons = kind === 'reco' ? REASONS_RECO : REASONS_ALERTE
  const initialReasonCode = reasons[0]!.code
  const [reasonCode, setReasonCode] = useState<DismissReasonCode>(initialReasonCode)
  const [reasonNote, setReasonNote] = useState('')
  const [error,      setError]      = useState<string | null>(null)

  function reset() {
    setReasonCode(initialReasonCode)
    setReasonNote('')
    setError(null)
  }

  async function dismiss(durationMonths: 6 | null) {
    setError(null)
    const supabase  = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Non authentifié'); return }

    const expires_at = durationMonths === null
      ? null
      : new Date(Date.now() + SIX_MONTHS_MS).toISOString()

    const { error: dbError } = await supabase
      .from('user_alert_dismissals')
      .upsert(
        {
          user_id:         user.id,
          alert_signature: signature,
          reason_code:     reasonCode,
          reason_note:     reasonNote.trim() || null,
          dismissed_at:    new Date().toISOString(),
          expires_at,
        },
        { onConflict: 'user_id,alert_signature' },
      )

    if (dbError) {
      setError(dbError.message)
      return
    }
    startTransition(() => {
      reset()
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'alert' ? 'Masquer cette alerte' : 'Masquer cette recommandation'}
      subtitle="Le masquage est strictement personnel et révocable."
    >
      <div className="space-y-5">
        {/* Rappel de l'item original */}
        <div className="bg-surface-2 border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-secondary uppercase tracking-wide mb-1.5">
            {kind === 'alert' ? 'Alerte concernée' : 'Recommandation concernée'}
          </p>
          <p className="text-sm text-primary">{preview}</p>
        </div>

        {/* Raisons */}
        <fieldset>
          <legend className="text-sm font-medium text-primary mb-2">Pourquoi&nbsp;?</legend>
          <div className="space-y-1.5">
            {reasons.map((r) => (
              <label
                key={r.code}
                className="flex items-start gap-2.5 cursor-pointer hover:bg-surface-2 px-2 py-1.5 rounded-md transition-colors"
              >
                <input
                  type="radio"
                  name="dismiss-reason"
                  value={r.code}
                  checked={reasonCode === r.code}
                  onChange={() => setReasonCode(r.code)}
                  className="mt-0.5 accent-accent"
                />
                <span className="text-sm text-primary">{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Note libre */}
        <div>
          <label htmlFor="dismiss-note" className="text-sm font-medium text-primary mb-1.5 block">
            Ajouter une note (facultatif)
          </label>
          <textarea
            id="dismiss-note"
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Précise pour ton suivi personnel"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Erreur éventuelle */}
        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button variant="secondary" onClick={() => dismiss(null)} disabled={pending}>
            Masquer définitivement
          </Button>
          <Button variant="primary" onClick={() => dismiss(6)} disabled={pending}>
            Masquer 6 mois
          </Button>
        </div>
      </div>
    </Modal>
  )
}
