/**
 * Bande des 5 scores d'intelligence (Phase 3) — anneau SVG par score,
 * scrollable horizontalement sur mobile.
 *
 * Couleurs anneaux : selon le `niveau` du Score.
 *   vert   → accent emerald
 *   jaune  → warning
 *   orange → warning + intensité +
 *   rouge  → danger
 *   gris   → muted (données insuffisantes)
 */
'use client'

import { useState } from 'react'
import { Shield, Target, Sparkles, Compass, Receipt, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ScoreDetailModal } from './ScoreDetailModal'
import type { ScoresComplets, ScoreNiveau, Score } from '@/types/analyse'

interface Props {
  scores: ScoresComplets
}

interface OpenScore { key: keyof ScoresComplets; title: string; score: Score }

const NIVEAU_COLOR: Record<ScoreNiveau, string> = {
  vert:   'var(--color-accent)',
  jaune:  'var(--color-warning)',
  orange: '#f97316',
  rouge:  'var(--color-danger)',
  gris:   'var(--color-muted)',
}

const SCORES_META: Array<{ key: keyof ScoresComplets; title: string; icon: LucideIcon }> = [
  { key: 'diversification',    title: 'Diversification', icon: Compass },
  { key: 'coherence_profil',   title: 'Cohérence',       icon: Target },
  { key: 'progression_fire',   title: 'Progression FIRE', icon: Sparkles },
  { key: 'solidite',           title: 'Solidité',        icon: Shield },
  { key: 'efficience_fiscale', title: 'Efficience fiscale', icon: Receipt },
]

export function ScoresBand({ scores }: Props) {
  const [open, setOpen] = useState<OpenScore | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SCORES_META.map(({ key, title, icon }) => (
          <ScoreCard
            key={key} title={title} icon={icon} score={scores[key]}
            onClick={() => setOpen({ key, title, score: scores[key] })}
          />
        ))}
      </div>
      <ScoreDetailModal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title ?? ''}
        score={open?.score ?? { value: null, niveau: 'gris', label: '' }}
      />
    </>
  )
}

function ScoreCard({
  title, icon: Icon, score, onClick,
}: {
  title: string; icon: LucideIcon; score: Score; onClick: () => void
}) {
  const color = NIVEAU_COLOR[score.niveau]
  const value = score.value

  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-4 text-left hover:border-border-2 hover:bg-surface-2/30 transition-colors cursor-pointer group relative w-full"
      title="Cliquer pour voir le détail du calcul"
    >
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest mb-3">
        <Icon size={11} />
        <span className="truncate flex-1">{title}</span>
        <ChevronRight size={11} className="text-muted group-hover:text-secondary transition-colors" />
      </div>
      <div className="flex items-center gap-3">
        <ScoreRingMini value={value} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary truncate" style={{ color: value !== null ? color : undefined }}>
            {score.label}
          </p>
          {score.details && (
            <p className="text-[10px] text-muted leading-relaxed mt-0.5 line-clamp-2">{score.details}</p>
          )}
        </div>
      </div>
    </button>
  )
}

function ScoreRingMini({ value, color }: { value: number | null; color: string }) {
  const size = 56
  const stroke = 5
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const v = value ?? 0
  const off = c - (v / 100) * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
      {value !== null && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
        />
      )}
      <text
        x={size / 2} y={size / 2 + 4}
        textAnchor="middle"
        fill={value !== null ? color : 'var(--color-muted)'}
        className="font-sans font-bold"
        style={{ fontSize: size * 0.32 }}
      >
        {value !== null ? value : '—'}
      </text>
    </svg>
  )
}
