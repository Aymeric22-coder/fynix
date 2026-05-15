/**
 * Jauge SVG en arc semi-circulaire (0..100). Utilisée pour visualiser
 * le score de risque investisseur.
 *
 * `tone` détermine la couleur du remplissage en s'appuyant sur les
 * tokens CSS globaux (--color-info / --color-accent / --color-warning
 * / --color-danger).
 */
'use client'

type Tone = 'info' | 'success' | 'warning' | 'danger'

interface GaugeArcProps {
  pct:    number     // 0..100
  tone?:  Tone
  label?: string     // libellé sous la jauge
}

const TONE_COLOR: Record<Tone, string> = {
  info:    'var(--color-info)',
  success: 'var(--color-accent)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
}

export function GaugeArc({ pct, tone = 'success', label }: GaugeArcProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const r       = 40
  const cx      = 56
  const cy      = 56
  const c       = Math.PI * r
  const offset  = c - (clamped / 100) * c
  const color   = TONE_COLOR[tone]
  const path    = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={112} height={68} viewBox="0 0 112 68">
        <path d={path} fill="none" stroke="var(--color-border)" strokeWidth={7} strokeLinecap="round" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <p className="font-sans font-bold text-lg" style={{ color }}>{clamped}/100</p>
      {label && <p className="text-xs text-muted">{label}</p>}
    </div>
  )
}
