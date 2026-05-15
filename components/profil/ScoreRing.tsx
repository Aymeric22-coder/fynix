/**
 * Anneau SVG affichant le score global investisseur (0-100).
 *
 * Couleur dérivée du score :
 *   - >= 70 → accent (succès)
 *   - >= 45 → warning (jaune)
 *   - < 45  → danger
 *
 * Animation : la stroke-dashoffset transite en 1.5s à l'apparition
 * (cubic-bezier ease-out) — l'effet est natif CSS.
 */
'use client'

interface ScoreRingProps {
  score: number          // 0..100
  size?: number          // px, défaut 120
  stroke?: number        // largeur trait, défaut 9
  /** Sous-titre sous l'anneau. */
  caption?: string
}

export function ScoreRing({ score, size = 120, stroke = 9, caption = 'Score global investisseur' }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const r       = size / 2 - stroke
  const cx      = size / 2
  const cy      = size / 2
  const c       = 2 * Math.PI * r
  const offset  = c - (clamped / 100) * c

  // Token CSS de couleur — coup d'œil à globals.css : --color-accent / --color-warning / --color-danger
  const color =
    clamped >= 70 ? 'var(--color-accent)'
    : clamped >= 45 ? 'var(--color-warning)'
    : 'var(--color-danger)'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1)' }}
        />
        {/* Score label */}
        <text
          x={cx} y={cy - 2}
          textAnchor="middle"
          fill={color}
          className="font-sans font-bold"
          style={{ fontSize: size * 0.22 }}
        >
          {clamped}
        </text>
        <text
          x={cx} y={cy + size * 0.14}
          textAnchor="middle"
          fill="var(--color-muted)"
          className="font-sans"
          style={{ fontSize: size * 0.1 }}
        >
          /100
        </text>
      </svg>
      {caption && <p className="text-xs text-secondary">{caption}</p>}
    </div>
  )
}
