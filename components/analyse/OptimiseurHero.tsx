/**
 * Bandeau hero affichant le total des gains fiscaux récupérables
 * (somme des opportunités applicables). Mis en évidence en haut de
 * l'onglet « Optimiser » de /analyse.
 *
 * - Somme `gain_annuel_eur` de toutes les opportunités fournies.
 * - Affiche le gain sur 5 ans en sous-titre.
 * - Si rien à gagner : message « optimisation au maximum ».
 */
'use client'

import { Lightbulb, CheckCircle2 } from 'lucide-react'
import { formatEur } from '@/lib/utils/format'
import type { OpportuniteFiscale } from '@/lib/analyse/optimiseurFiscal'

interface OptimiseurHeroProps {
  opportunites: OpportuniteFiscale[]
}

export function OptimiseurHero({ opportunites }: OptimiseurHeroProps) {
  const gainAnnuel = opportunites.reduce((s, o) => s + (o.gain_annuel_eur ?? 0), 0)
  const gain5ans   = gainAnnuel * 5

  if (gainAnnuel === 0) {
    return (
      <section className="rounded-xl border border-accent/30 bg-accent/5 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-accent/15 p-2.5 flex-shrink-0">
            <CheckCircle2 size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary">
              ✅ Ton optimisation fiscale est au maximum
            </h2>
            <p className="text-sm text-secondary mt-1 leading-relaxed">
              Aucune opportunité fiscale supplémentaire détectée selon ta situation actuelle.
              Les enveloppes et régimes applicables sont déjà exploités.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-6 relative overflow-hidden">
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-start gap-4">
        <div className="rounded-full bg-amber-400/15 p-2.5 flex-shrink-0">
          <Lightbulb size={22} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-secondary uppercase tracking-widest">
            Économies potentielles
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-primary financial-value mt-1">
            💡 {formatEur(gainAnnuel, { decimals: 0 })}
            <span className="text-base text-secondary font-medium ml-1.5">/an</span>
            <span className="text-sm sm:text-base text-secondary font-normal ml-2">
              que tu laisses sur la table
            </span>
          </h2>
          <p className="text-sm text-secondary mt-2">
            Sur 5 ans = <span className="text-primary financial-value font-medium">
              {formatEur(gain5ans, { decimals: 0 })}
            </span> non récupérés
          </p>
        </div>
      </div>
    </section>
  )
}
