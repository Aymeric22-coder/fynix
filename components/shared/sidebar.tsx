'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Building2, PiggyBank,
  Briefcase, Settings, LogOut, ChevronRight, UserCircle2, PieChart,
  Menu, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Migration 006 : la section "Dettes" a été supprimée (crédits immobiliers
// gérés directement depuis chaque bien — onglet Crédit).
// Migrations 007-014 : la section "Portefeuille" unifie actions, ETF, crypto,
// SCPI, fonds, REIT, obligations, métaux et actifs alternatifs sous un
// modèle unique positions/instruments. Les anciennes routes /financier
// et /scpi ont été supprimées (migration 012).
// Les sections "Transactions" et "DCA" ont été retirées de la navigation —
// l'historique reste en base (tables transactions / dca_plans / dca_occurrences)
// mais n'est plus exposé dans l'UI.
const NAV = [
  { href: '/profil',       label: 'Profil',        icon: UserCircle2 },
  { href: '/dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/portefeuille', label: 'Portefeuille',  icon: Briefcase },
  { href: '/immobilier',   label: 'Immobilier',    icon: Building2 },
  { href: '/cash',         label: 'Cash',          icon: PiggyBank },
  { href: '/analyse',      label: 'Analyse',       icon: PieChart },
]

// breakpoint lg = 1024px (Tailwind par defaut). En dessous : drawer mobile.

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    onNavigate?.()
    router.push('/login')
  }

  return (
    <>
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <span className="text-xl font-bold tracking-tight">
          FIRE<span className="text-accent">CORE</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                          transition-all duration-150 ${
                active
                  ? 'bg-accent-muted text-accent font-medium'
                  : 'text-secondary hover:text-primary hover:bg-surface-2'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={12} className="opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <Link
          href="/parametres"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                     text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        >
          <Settings size={16} />
          Paramètres
        </Link>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                     text-secondary hover:text-danger hover:bg-danger-muted transition-colors"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Ferme le drawer a chaque changement de route (au cas ou un Link
  // declenche une nav sans passer par onNavigate).
  useEffect(() => { setOpen(false) }, [pathname])

  // Bloque le scroll body quand le drawer mobile est ouvert.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Sidebar desktop (>= lg) */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col bg-surface border-r border-border h-full">
        <SidebarContent />
      </aside>

      {/* Bouton burger mobile (< lg) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        className="lg:hidden fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center
                   rounded-full bg-accent text-white shadow-lg shadow-black/40 hover:bg-accent-hover transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Drawer mobile */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            className="relative w-64 max-w-[80vw] flex-shrink-0 flex flex-col bg-surface border-r border-border h-full
                       animate-in slide-in-from-left duration-200"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute top-3 right-3 p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
