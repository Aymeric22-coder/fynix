'use client'

import { useEffect, useRef, useState } from 'react'
import { cn, formatCurrency, formatPercent } from '@/lib/utils/format'

interface AnimatedNumberProps {
  value:     number
  duration?: number    // ms, défaut 1200
  /** Mode devise : formate via formatCurrency (compact/sign respectés). */
  currency?: string
  compact?:  boolean
  sign?:     boolean
  /** Mode pourcentage : formate via formatPercent. */
  percent?:  boolean
  decimals?: number
  /** Mode brut (ni currency ni percent) : préfixe/suffixe libres. */
  prefix?:   string
  suffix?:   string
  glow?:     boolean
  className?: string
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

/**
 * Compteur animé (count-up) en requestAnimationFrame avec easing easeOutExpo.
 * Respecte prefers-reduced-motion : affiche directement la valeur finale.
 * Le formatage final réutilise formatCurrency / formatPercent → zéro
 * divergence visuelle avec le rendu statique. Purement décoratif : la
 * valeur métier reçue n'est jamais altérée.
 */
export function AnimatedNumber({
  value, duration = 1200, currency, compact, sign, percent,
  decimals, prefix = '', suffix = '', glow, className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef  = useRef<number | null>(null)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce || duration <= 0) {
      setDisplay(value)
      fromRef.current = value
      return
    }

    const from  = fromRef.current
    const delta = value - from
    if (delta === 0) return

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setDisplay(from + delta * easeOutExpo(t))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, duration])

  let text: string
  if (currency !== undefined) {
    text = formatCurrency(display, currency, { compact, sign, decimals })
  } else if (percent) {
    text = formatPercent(display, { sign, decimals })
  } else {
    text = `${prefix}${display.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 0,
    })}${suffix}`
  }

  return (
    <span className={cn('tabular-nums', glow && 'text-glow', className)}>
      {text}
    </span>
  )
}
