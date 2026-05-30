/**
 * Modal de confirmation typée pour la réinitialisation du profil.
 *
 * Anti-clic-accidentel : l'utilisateur doit taper EXACTEMENT « RESET »
 * pour activer le bouton « Réinitialiser ».
 *
 * Sur confirmation : POST /api/profile/reset puis redirection vers /bienvenue
 * pour redémarrer l'onboarding 60s + wizard.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface Props {
  open:    boolean
  onClose: () => void
}

const CONFIRM_WORD = 'RESET'

export function ResetProfileModal({ open, onClose }: Props) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const canSubmit = confirmText === CONFIRM_WORD && !submitting

  async function handleReset() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch('/api/profile/reset', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      // Redirect vers /bienvenue pour redémarrer l'onboarding 60s.
      const target = json.data?.redirect ?? '/bienvenue'
      router.push(target)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (submitting) return
    setConfirmText('')
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Réinitialiser ton profil"
      subtitle="Action irréversible — relis attentivement avant de confirmer."
      size="md"
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-danger/30 bg-danger-muted p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="text-xs text-secondary leading-relaxed">
            <p className="text-primary font-medium text-sm mb-2">
              Ce qui sera effacé
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Toutes les réponses du wizard (étapes 1 à 9)</li>
              <li>Les valeurs de l&apos;onboarding 60&nbsp;s</li>
              <li>Les sentinelles de progression (wizard_step, profile_completed_at)</li>
              <li>Les anciennes colonnes fiscales devenues silencieuses (TMI, parts, etc.)</li>
            </ul>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-primary font-medium text-sm mb-2">
            Ce qui sera préservé
          </p>
          <ul className="text-xs text-secondary leading-relaxed list-disc list-inside space-y-1">
            <li>Ton compte et ton e-mail</li>
            <li>Ton nom d&apos;affichage</li>
            <li>Tes préférences de rapport mensuel</li>
            <li>
              <span className="text-primary">Toutes tes autres données</span> :
              positions, biens immobiliers, comptes cash, enveloppes financières,
              snapshots historiques…
            </li>
          </ul>
        </div>

        <div>
          <label htmlFor="reset-confirm" className="block text-sm text-secondary mb-2">
            Tape <span className="text-primary font-mono font-semibold">{CONFIRM_WORD}</span> pour confirmer
          </label>
          <input
            id="reset-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            placeholder={CONFIRM_WORD}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-accent transition-colors font-mono"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
            Erreur : {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={handleReset}
            disabled={!canSubmit}
            loading={submitting}
          >
            Réinitialiser
          </Button>
        </div>
      </div>
    </Modal>
  )
}
