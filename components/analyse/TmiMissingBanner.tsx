/**
 * CS1 — Bandeau « Renseigne ta TMI » affiché en haut de /analyse.
 *
 * Conditions d'affichage (toutes requises) :
 *   - le profil est COMPLET (profile_completed_at NOT NULL) — on ne harcèle
 *     pas un utilisateur qui n'a pas fini son onboarding ;
 *   - le profil a tmi_rate IS NULL — donc tous les calculs fiscaux tournent
 *     sur le fallback 30 % de constants.ts ;
 *   - l'utilisateur n'a pas explicitement cliqué « Plus tard » dans cette
 *     session (flag localStorage, volontairement non persisté en DB pour
 *     rester léger ; un nouveau navigateur le réaffichera).
 *
 * Discret, pas modal, link direct vers /profil pour relancer le wizard à
 * l'étape Fiscalité.
 */
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Percent, X } from 'lucide-react'
import { useUserProfile } from '@/hooks/use-user-profile'

const DISMISS_KEY = 'fynix.tmi-missing-banner.dismissed'

export function TmiMissingBanner() {
  const { profile, loading } = useUserProfile()
  const [dismissed, setDismissed] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      // localStorage indisponible (mode privé strict) → on n'affiche pas
      // de bandeau persistant, mais ce n'est pas bloquant.
    }
  }, [])

  if (loading || !profile) return null
  if (dismissed) return null
  if (profile.tmi_rate !== null && profile.tmi_rate !== undefined) return null
  if (!profile.profile_completed_at) return null

  function handleDismiss() {
    setDismissed(true)
    try { window.localStorage.setItem(DISMISS_KEY, '1') } catch { /* noop */ }
  }

  return (
    <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-3.5 flex items-start gap-3">
      <Percent size={16} className="text-accent flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-primary leading-relaxed">
          Renseigne ta TMI pour calibrer précisément tes recos fiscales —
          environ 30 secondes.
        </p>
        <p className="text-xs text-muted mt-1">
          Pour l&apos;instant, on suppose 30 % par défaut (sous-estime le gain
          PER pour un cadre à 41 %).
        </p>
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <Link
            href="/profil"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          >
            Renseigner ma TMI
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:text-primary transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fermer ce bandeau"
        className="flex-shrink-0 text-muted hover:text-secondary transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
