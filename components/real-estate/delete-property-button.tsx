'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

interface Props {
  propertyId:   string
  propertyName: string
  /** Si fourni : redirection après suppression réussie. Sinon refresh router. */
  redirectTo?:  string
  /** Variant du bouton déclencheur — "icon" pour la liste, "text" pour la fiche. */
  variant?:     'icon' | 'text'
}

/**
 * Bouton "Supprimer ce bien" + modale de confirmation.
 *
 * Garde-fous :
 *  - Pas d'auto-focus sur le bouton "Supprimer définitivement" — l'utilisateur
 *    doit délibérément aller le cliquer (focus initial sur "Annuler").
 *  - Texte rappelant que l'action est irréversible + nom du bien.
 *  - Erreurs API affichées dans la modale (modale reste ouverte).
 */
export function DeletePropertyButton({
  propertyId, propertyName, redirectTo, variant = 'text',
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/real-estate/${propertyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      setOpen(false)
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
          className="p-1.5 rounded hover:bg-surface-2 text-muted hover:text-danger transition-colors"
          title="Supprimer ce bien"
          aria-label={`Supprimer ${propertyName}`}
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Trash2}
          onClick={() => setOpen(true)}
        >
          Supprimer ce bien
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => { if (!busy) { setOpen(false); setError(null) } }}
        title="Supprimer ce bien ?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-primary">
                Cette action est <span className="font-medium text-danger">irréversible</span>.
              </p>
              <p className="text-secondary mt-1">
                Le bien <span className="text-primary font-medium">«&nbsp;{propertyName}&nbsp;»</span>,
                tous ses lots, crédits, charges, valorisations, dispositifs fiscaux
                et documents associés seront définitivement supprimés.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            {/* Focus initial sur Annuler — pas sur le bouton destructif */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setOpen(false); setError(null) }}
              autoFocus
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={handleDelete}
            >
              Supprimer définitivement
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
