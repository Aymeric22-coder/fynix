/**
 * Mini-anneau SVG pour les scores de diversification.
 * Cousin léger de components/profil/ScoreRing — ici on garde un format
 * compact à coller à côté d'un titre de section.
 */
'use client'

interface Props {
  score:   number      // 0..100
  size?:   number      // px, défaut 56
  caption?:string
}

export function MiniRing({ score, size = 56, caption }: Props) {
  const v = Math.max(0, Math.min(100, Math.round(score)))
  const stroke = 6
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const off = c - (v / 100) * c
  const color =
    v >= 70 ? 'var(--color-accent)'
    : v >= 40 ? 'var(--color-warning)'
    : 'var(--color-danger)'

  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
        />
        <text
          x={size / 2} y={size / 2 + 4}
          textAnchor="middle"
          fill={color}
          className="font-sans font-bold"
          style={{ fontSize: size * 0.32 }}
        >
          {v}
        </text>
      </svg>
      {caption && <span className="text-xs text-secondary">{caption}</span>}
    </div>
  )
}
