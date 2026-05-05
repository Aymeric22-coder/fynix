'use client'

import { useEffect, useRef } from 'react'
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

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
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
}
