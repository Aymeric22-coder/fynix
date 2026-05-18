'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/format'

interface ModalProps {
  open:       boolean
  onClose:    () => void
  title:      string
  subtitle?:  string
  children:   React.ReactNode
  size?:      'sm' | 'md' | 'lg'
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl' }

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Le portail vit dans `document.body` pour éviter que les clics à
  // l'intérieur du modal remontent par bubbling vers un éventuel
  // ancêtre cliquable (par ex. une carte `<Link>` qui contient le
  // bouton d'ouverture). C'était la cause d'une nav inattendue
  // observée sur /immobilier après ouverture du simulateur de revente.
  //
  // Marqueur de montage côté client : createPortal n'est pas disponible
  // côté serveur (pas de document). On garde un fallback SSR-safe.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Fermer avec Échap
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Bloquer le scroll body
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open || !mounted) return null

  const content = (
    <div
      ref={overlayRef}
      // stopPropagation à la racine du portail pour bloquer définitivement
      // la remontée des clics vers l'arbre React parent (par ex. un Link).
      // Le portail rend déjà le modal hors du DOM du parent, mais React
      // propage encore les événements synthétiques selon l'arbre React,
      // donc on coupe explicitement ici.
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === overlayRef.current) onClose()
      }}
      onMouseDown={(e) => { e.stopPropagation() }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className={cn(
        'w-full bg-surface border border-border rounded-xl shadow-2xl',
        'flex flex-col max-h-[90vh]',
        SIZES[size],
      )}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-primary">{title}</h2>
            {subtitle && <p className="text-sm text-secondary mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary hover:bg-surface-2 p-1.5 rounded-lg transition-colors ml-4 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
