'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Building2, PiggyBank,
  ArrowLeftRight, RefreshCw, Briefcase, Settings, LogOut, ChevronRight, UserCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Migration 006 : la section "Dettes" a été supprimée (crédits immobiliers
// gérés directement depuis chaque bien — onglet Crédit).
// Migrations 007-014 : la section "Portefeuille" unifie actions, ETF, crypto,
// SCPI, fonds, REIT, obligations, métaux et actifs alternatifs sous un
// modèle unique positions/instruments. Les anciennes routes /financier
// et /scpi ont été supprimées (migration 012).
const NAV = [
  { href: '/dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/profil',       label: 'Profil',        icon: UserCircle2 },
  { href: '/portefeuille', label: 'Portefeuille',  icon: Briefcase },
  { href: '/immobilier',   label: 'Immobilier',    icon: Building2 },
  { href: '/cash',         label: 'Cash',          icon: PiggyBank },
  { href: '/transactions', label: 'Transactions',  icon: ArrowLeftRight },
  { href: '/dca',          label: 'DCA',           icon: RefreshCw },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border h-full">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <span className="text-xl font-bold tracking-tight">
          FY<span className="text-accent">NIX</span>
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
    </aside>
  )
}
