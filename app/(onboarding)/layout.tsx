/**
 * Layout dédié à l'onboarding 60 secondes — pas de sidebar, pas de
 * header app, focus total sur les 3 questions et le résultat.
 *
 * Logo FIRECORE centré en haut + contenu plein écran scrollable.
 * L'utilisateur ne peut pas naviguer ailleurs depuis ce layout
 * (volontaire) — il sort soit par « Commencer à tracker » (→ dashboard)
 * soit par « Affiner ma projection » (→ wizard /profil).
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bienvenue' }

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-6 py-6 flex items-center justify-center">
        <span className="text-2xl font-bold tracking-tight text-primary">
          FIRE<span className="text-accent">CORE</span>
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 pb-12">
        <div className="w-full max-w-xl">
          {children}
        </div>
      </main>
    </div>
  )
}
