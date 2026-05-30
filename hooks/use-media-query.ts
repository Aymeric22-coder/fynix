/**
 * Hook réutilisable pour matcher une CSS media query côté client.
 *
 * SSR-safe : retourne `false` au premier render (côté serveur ou avant
 * mount) puis bascule sur la vraie valeur après mount via `useEffect`.
 * Re-render quand le breakpoint est franchi (resize de la fenêtre).
 *
 * Usage typique pour décider mount/unmount conditionnel d'un composant
 * coûteux qu'on ne veut pas évaluer sur mobile.
 */
'use client'

import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const apply = () => setMatches(mq.matches)
    apply()
    // Safari < 14 : addEventListener('change') uniquement
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [query])

  return matches
}

/** Breakpoint Tailwind `lg` (>= 1024px). Sticky/desktop wizard avatar. */
export const MEDIA_LG = '(min-width: 1024px)'
