'use client'

import { usePathname } from 'next/navigation'

/**
 * Rejoue l'animation `page-enter` à chaque changement de route en
 * remontant le conteneur via `key={pathname}`. L'animation elle-même
 * (et son respect de prefers-reduced-motion) vit dans globals.css.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  )
}
