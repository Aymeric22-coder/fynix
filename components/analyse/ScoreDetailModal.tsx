/**
 * Modal de détail d'un score d'intelligence (Phase 7).
 *
 * Affichée quand l'utilisateur clique sur une carte de ScoresBand. Montre :
 *   1. Le score en grand avec son label
 *   2. La formule utilisée (texte humain, pas du code)
 *   3. Les inputs réels qui ont alimenté le calcul (KPI table)
 *   4. La lecture / interprétation (pourquoi ce niveau)
 *   5. L'action concrète à mener (optionnel)
 */
'use client'

import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils/format'
import type { Score, ScoreNiveau } from '@/types/analyse'

interface Props {
  open:     boolean
  onClose:  () => void
  /** Titre court (ex: "Diversification"). */
  title:    string
  score:    Score
}

const NIVEAU_COLOR: Record<ScoreNiveau, string> = {
  vert:   'var(--color-accent)',
  jaune:  'var(--color-warning)',
  orange: '#f97316',
  rouge:  'var(--color-danger)',
  gris:   'var(--color-muted)',
}

export function ScoreDetailModal({ open, onClose, title, score }: Props) {
  const color = NIVEAU_COLOR[score.niveau]
  const v = score.value

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-5">
        {/* Score en grand */}
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg width={80} height={80} viewBox="0 0 80 80">
              <circle cx={40} cy={40} r={34} fill="none" stroke="var(--color-border)" strokeWidth={7} />
              {v !== null && (
                <circle
                  cx={40} cy={40} r={34} fill="none"
                  stroke={color} strokeWidth={7} strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 34}
                  strokeDashoffset={2 * Math.PI * 34 * (1 - v / 100)}
                  transform="rotate(-90 40 40)"
                />
              )}
              <text
                x={40} y={47} textAnchor="middle"
                fill={v !== null ? color : 'var(--color-muted)'}
                className="font-sans font-bold"
                style={{ fontSize: 22 }}
              >
                {v !== null ? v : '—'}
              </text>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold" style={{ color: v !== null ? color : undefined }}>
              {score.label}
            </p>
            {score.details && <p className="text-xs text-secondary mt-1">{score.details}</p>}
          </div>
        </div>

        {/* Formule */}
        {score.explanation?.formule && (
          <Section title="Formule utilisée">
            <pre className="text-xs text-secondary bg-surface-2 rounded-lg p-3 leading-relaxed whitespace-pre-wrap font-mono">
              {score.explanation.formule}
            </pre>
          </Section>
        )}

        {/* Inputs */}
        {score.explanation?.inputs && score.explanation.inputs.length > 0 && (
          <Section title="Détail du calcul sur votre patrimoine">
            <div className="space-y-1.5">
              {score.explanation.inputs.map((inp) => (
                <div
                  key={inp.label}
                  className={cn(
                    'flex items-baseline justify-between gap-3 text-sm',
                    inp.highlight && 'pt-2 mt-1 border-t border-border',
                  )}
                >
                  <span className={cn('text-secondary', inp.highlight && 'text-primary font-medium')}>
                    {inp.label}
                  </span>
                  <span
                    className={cn('financial-value text-right text-xs', inp.highlight ? 'text-primary font-semibold' : 'text-secondary')}
                    style={inp.highlight ? { color } : undefined}
                  >
                    {inp.value}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Lecture */}
        {score.explanation?.lecture && (
          <Section title="Interprétation">
            <p className="text-sm text-primary leading-relaxed">{score.explanation.lecture}</p>
          </Section>
        )}

        {/* Action */}
        {score.explanation?.action && (
          <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-3">
            <p className="text-[10px] text-secondary uppercase tracking-widest mb-1">Action recommandée</p>
            <p className="text-sm text-primary leading-relaxed">{score.explanation.action}</p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-muted leading-relaxed pt-3 border-t border-border">
          ⚠ Score calculé automatiquement à partir de vos données. Indicateur d&apos;orientation,
          pas un conseil en investissement au sens AMF.
        </p>
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-secondary uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  )
}
