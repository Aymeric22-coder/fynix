/**
 * Empty state du dashboard quand l'utilisateur n'a aucun actif renseigne.
 * Affiche 3 CTA vers les pages d'ajout pour lui montrer par ou commencer.
 *
 * Quick Win : bouton « 💬 Demander à ARIA » avec prompt pré-rempli pour
 * faire découvrir l'assistant dès le premier écran.
 */
'use client'

import Link from 'next/link'
import { Briefcase, Building2, PiggyBank, ArrowRight, MessageCircle } from 'lucide-react'
import { openAriaWithPrompt } from '@/lib/aria/openAria'

const ENTRIES = [
  {
    href: '/portefeuille',
    label: 'Portefeuille',
    icon: Briefcase,
    description: 'Actions, ETF, crypto, SCPI, fonds...',
  },
  {
    href: '/immobilier',
    label: 'Immobilier',
    icon: Building2,
    description: 'Residence principale, locatif, SCI...',
  },
  {
    href: '/cash',
    label: 'Cash',
    icon: PiggyBank,
    description: 'Compte courant, Livret A, LDDS, fonds euros...',
  },
] as const

export function DashboardEmptyState() {
  return (
    <section className="card p-8 sm:p-10 text-center space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-primary">
          Commence par ajouter un actif
        </h2>
        <p className="text-sm text-secondary mt-2 max-w-md mx-auto">
          Renseigne ce que tu detiens et Fynix calcule automatiquement allocation,
          scores, trajectoire d&apos;indépendance et recommandations.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
        {ENTRIES.map(({ href, label, icon: Icon, description }) => (
          <Link
            key={href}
            href={href}
            className="card p-4 text-left hover:border-accent transition-colors group"
          >
            <Icon size={20} className="text-accent mb-2" />
            <p className="text-sm font-medium text-primary flex items-center gap-1">
              {label}
              <ArrowRight size={12} className="text-muted group-hover:text-accent transition-colors" />
            </p>
            <p className="text-xs text-muted mt-1">{description}</p>
          </Link>
        ))}
      </div>

      <p className="text-xs text-muted">
        Astuce : tu peux importer un export CSV depuis Trade Republic, Degiro,
        Boursorama, Fortuneo et bien d&apos;autres.
      </p>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => openAriaWithPrompt(
            "Je viens de créer mon compte. Par où commencer pour atteindre l'indépendance financière le plus tôt possible ?",
          )}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg
                     border border-border text-sm text-secondary hover:text-primary
                     hover:border-accent/40 hover:bg-accent/5 transition-colors"
        >
          <MessageCircle size={14} />
          💬 Demander à ARIA
        </button>
      </div>
    </section>
  )
}
