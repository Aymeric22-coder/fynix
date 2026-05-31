/**
 * Consolidation 2 — `<ConfirmDialog>` réutilisable.
 *
 * Wrapper du composant `<Modal>` existant (components/ui/modal.tsx) :
 *   - Modal gère déjà portail, Escape, click-outside, body scroll lock.
 *   - ConfirmDialog ajoute : titre + description + 2 boutons (Cancel,
 *     Confirm) + bouton confirm Enter.
 *
 * Pourquoi pas Radix/shadcn : `<Modal>` existant suffit et préserve la
 * cohérence visuelle FIRECORE. Pas d'ajout de dépendance.
 *
 * Pas de focus trap explicite : héritage du `<Modal>` parent. Acceptable
 * MVP (les boutons sont accessibles via Tab, Escape ferme, Enter
 * confirme).
 *
 * Usage :
 *   ```
 *   const [open, setOpen] = useState(false)
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Supprimer ce bien ?"
 *     description="Cette action est irréversible."
 *     confirmLabel="Supprimer"
 *     cancelLabel="Annuler"
 *     variant="destructive"
 *     onConfirm={() => deletePropertyMutation.mutate()}
 *   />
 *   ```
 */
'use client'

import { useEffect } from 'react'
import { Modal } from './modal'
import { Button } from './button'

interface Props {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  title:          string
  /** Texte ou React node pour formatage riche. */
  description:    React.ReactNode
  /** Défaut : « Confirmer ». */
  confirmLabel?:  string
  /** Défaut : « Annuler ». */
  cancelLabel?:   string
  /** `default` (bouton primary) ou `destructive` (bouton danger). */
  variant?:       'default' | 'destructive'
  /** Appelé quand l'utilisateur confirme. La fermeture est gérée par le
   *  composant — pas besoin d'appeler `onOpenChange(false)` ici. */
  onConfirm:      () => void
}

export function ConfirmDialog({
  open, onOpenChange,
  title, description,
  confirmLabel = 'Confirmer',
  cancelLabel  = 'Annuler',
  variant      = 'default',
  onConfirm,
}: Props) {
  // Enter confirme quand la modal est ouverte. Escape est déjà géré
  // par `<Modal>`. Le handler est posé sur `window` pour ne dépendre
  // d'aucun focus particulier (acceptable MVP, accessible).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onConfirm, onOpenChange])

  function handleConfirm() {
    onConfirm()
    onOpenChange(false)
  }

  function handleCancel() {
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title={title}
      size="sm"
    >
      <div data-testid="confirm-dialog" className="space-y-5">
        <div className="text-sm text-secondary leading-relaxed">
          {description}
        </div>

        <div className="flex items-center justify-end gap-3 flex-wrap">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
