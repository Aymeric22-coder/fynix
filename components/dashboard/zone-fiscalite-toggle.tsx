/**
 * ZoneFiscaliteToggle — Z9 de l'architecture Dashboard V2.
 *
 * Bouton dépliant qui révèle les 3 widgets fiscaux :
 *   - FiscalKpiBanner    (opportunités d'optimisation chiffrées)
 *   - CalendrierFiscal   (échéances fiscales 12 prochains mois)
 *   - ActionsDuMois      (filtre `fiscal-only`)
 *
 * **Masqué par défaut** : la fiscalité = optimisation, pas pilotage
 * (cf. décision produit V2). L'utilisateur le révèle quand il veut.
 *
 * **Persistance localStorage** : clé `fynix:dashboard:fiscalite_open`.
 *
 * **Approche hydration** : état initial `null` (= "pas encore décidé").
 * Tant que `useEffect` n'a pas tourné côté client, on rend le toggle
 * en mode "fermé" par défaut (cohérent avec la politique produit
 * « masqué par défaut »). Pas de flash inverse si l'utilisateur avait
 * fermé → on reste fermé. Si l'utilisateur avait ouvert → flash bref
 * "fermé → ouvert" au mount, acceptable car la transition naturelle
 * va dans le sens de l'attente utilisateur.
 *
 * **Auto-masquage** : si l'utilisateur n'a NI opportunité fiscale NI
 * échéance NI action fiscale, le composant `return null` (pas de
 * bouton qui révèlerait du vide).
 */
'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Receipt } from 'lucide-react'
import { FiscalKpiBanner } from '@/components/dashboard/fiscal-kpi-banner'
import {
  CalendrierFiscal,
  type EvenementFiscalSerialisable,
} from '@/components/dashboard/calendrier-fiscal'
import { ActionsDuMois } from '@/components/dashboard/actions-du-mois'
import type { OpportuniteFiscale } from '@/lib/analyse/optimiseurFiscal'
import type { ActionMensuelle } from '@/lib/analyse/recoMensuelles'

const STORAGE_KEY = 'fynix:dashboard:fiscalite_open'

interface Props {
  opportunitesFiscales: OpportuniteFiscale[]
  evenementsFiscaux:    EvenementFiscalSerialisable[]
  /** Toutes les actions du mois — le filtre `fiscal-only` est appliqué en interne. */
  actions:              ActionMensuelle[]
}

export function ZoneFiscaliteToggle({
  opportunitesFiscales,
  evenementsFiscaux,
  actions,
}: Props) {
  const [open, setOpen] = useState<boolean | null>(null)

  // Lit l'état persisté au montage (client-side uniquement).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      setOpen(stored === 'true')
    } catch {
      setOpen(false)
    }
  }, [])

  // Y a-t-il QUELQUE CHOSE à révéler ? Si non, on n'affiche même pas le bouton.
  const hasOpportunites = opportunitesFiscales.length > 0
  const hasCalendrier   = evenementsFiscaux.length > 0
  const hasFiscalActions = actions.some((a) => a.type === 'fiscal')
  const hasAnything     = hasOpportunites || hasCalendrier || hasFiscalActions
  if (!hasAnything) return null

  // `open === null` (pas encore hydraté) → on rend en mode fermé par défaut.
  // Cohérent avec la politique « fiscalité masquée par défaut » : pas de
  // flash inverse si l'utilisateur l'avait fermé. Si ouvert, courte
  // transition "fermé → ouvert" au mount, dans le sens de l'attente.
  const isOpen = open === true

  const handleToggle = () => {
    const next = !isOpen
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // localStorage indisponible (SSR strict, incognito particulier…) — on continue sans persister.
    }
  }

  return (
    <section className="space-y-4" aria-label="Fiscalité (repliable)">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="zone-fiscalite-contenu"
        className="card w-full p-4 flex items-center justify-between gap-3 hover:bg-surface-2 transition-colors text-left"
      >
        <span className="flex items-center gap-2">
          <Receipt size={16} className="text-accent" />
          <span className="text-sm font-medium text-primary">
            {isOpen ? 'Masquer la fiscalité' : 'Afficher la fiscalité'}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div id="zone-fiscalite-contenu" className="space-y-4">
          {hasOpportunites && <FiscalKpiBanner opportunites={opportunitesFiscales} />}
          {hasCalendrier && <CalendrierFiscal evenements={evenementsFiscaux} />}
          <ActionsDuMois actions={actions} filter="fiscal-only" />
        </div>
      )}
    </section>
  )
}
