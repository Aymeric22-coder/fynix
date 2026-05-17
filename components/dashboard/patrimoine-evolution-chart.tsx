/**
 * Courbe d'évolution du patrimoine net dans le temps.
 *
 * Charge GET /api/analyse/snapshots (table wealth_snapshots remplie en
 * fire-and-forget à chaque visite de /analyse via usePatrimoineAnalyse).
 *
 * Affiche :
 *   - AreaChart patrimoine net (vert emerald) + brut (gris dashed)
 *   - Ligne pointillée horizontale = cible FIRE (or)
 *   - Tooltip détaillé : net, brut, portefeuille, immo, cash
 *   - Empty state si < 2 snapshots
 */
'use client'

import { useEffect, useState } from 'react'
import {
  ComposedChart, Area, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/format'

interface SnapshotRow {
  snapshot_date:          string
  patrimoine_brut:        number
  patrimoine_net:         number
  total_portefeuille:     number
  total_immo:             number
  total_cash:             number
  total_dettes:           number
  revenu_passif_mensuel:  number
  progression_fire_pct:   number | null
}

interface Props {
  /** Cible FIRE en € (revenu_passif_cible × 12 × 25). Si fournie, on trace
   *  une ligne pointillée horizontale dorée. Null = on ne trace rien. */
  cibleFire?: number | null
}

export function PatrimoineEvolutionChart({ cibleFire }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [mounted,   setMounted]   = useState(false)
  // breakpoint md = 768px : sous ce seuil on reduit la largeur de l'axe Y
  // pour donner plus de place a la courbe sur mobile (375px).
  const [yAxisWidth, setYAxisWidth] = useState(56)

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setYAxisWidth(mq.matches ? 40 : 56)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/analyse/snapshots?limit=24', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json.error) setError(json.error)
        else            setSnapshots((json.data ?? []) as SnapshotRow[])
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [])

  // ── États ──────────────────────────────────────────────────────────
  if (snapshots === null && !error) {
    return (
      <section className="card p-6">
        <Header />
        <div className="h-48 md:h-64 skeleton" />
      </section>
    )
  }

  if (error) {
    return (
      <section className="card p-6">
        <Header />
        <div className="h-32 flex items-center justify-center text-sm text-danger">
          Erreur de chargement de l&apos;historique : {error}
        </div>
      </section>
    )
  }

  if (!snapshots || snapshots.length < 2) {
    return (
      <section className="card p-6">
        <Header />
        <div className="h-32 flex flex-col items-center justify-center text-center gap-1">
          <p className="text-sm text-secondary">
            {snapshots && snapshots.length === 1
              ? 'Un seul point — il en faut au moins 2 pour la courbe'
              : 'Le graphique se construira au fil de vos visites'}
          </p>
          <p className="text-xs text-muted max-w-md">
            Chaque consultation de la page Analyse enregistre un point sur cette courbe.
            Revenez demain pour démarrer votre trajectoire.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="card p-6">
      <Header lastDate={snapshots[snapshots.length - 1]!.snapshot_date} count={snapshots.length} />
      {mounted && (
        <div className="h-48 md:h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={snapshots} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="wealth-net" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="wealth-brut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#6b7280" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#6b7280" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="snapshot_date"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
              }
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickFormatter={formatYAxis}
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
              width={yAxisWidth}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Cible FIRE : ligne pointillée horizontale dorée */}
            {cibleFire && cibleFire > 0 && (
              <ReferenceLine
                y={cibleFire}
                stroke="#E8B84B"
                strokeDasharray="4 4"
                label={{
                  value: `Cible FIRE ${formatCurrency(cibleFire, 'EUR', { compact: true })}`,
                  position: 'insideTopRight',
                  fill: '#E8B84B',
                  fontSize: 10,
                }}
              />
            )}
            {/* Brut en aire gris (référence haute) */}
            <Area
              type="monotone"
              dataKey="patrimoine_brut"
              name="Brut"
              stroke="#9ca3af"
              fill="url(#wealth-brut)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
            {/* Net en aire emerald (courbe principale) */}
            <Area
              type="monotone"
              dataKey="patrimoine_net"
              name="Net"
              stroke="#10b981"
              fill="url(#wealth-net)"
              strokeWidth={2}
              dot={false}
            />
            {/* Ligne portefeuille seule en référence légère */}
            <Line
              type="monotone"
              dataKey="total_portefeuille"
              name="Portefeuille"
              stroke="#3b82f6"
              strokeWidth={1}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function Header({ lastDate, count }: { lastDate?: string; count?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h2 className="text-sm font-medium text-primary flex items-center gap-2">
          <TrendingUp size={14} className="text-accent" />
          Évolution du patrimoine
        </h2>
        <p className="text-xs text-secondary mt-0.5">
          {count && lastDate
            ? `${count} snapshot${count > 1 ? 's' : ''} · dernier le ${formatDate(lastDate, 'medium')}`
            : 'Historique du patrimoine net + brut'}
        </p>
      </div>
    </div>
  )
}

function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000)     return `${(value / 1_000).toFixed(0)}k`
  return String(value)
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string; payload: SnapshotRow }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]!.payload
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-56">
      <p className="text-xs text-secondary mb-2">{formatDate(label, 'medium')}</p>
      <Row label="Net"          value={row.patrimoine_net}      color="#10b981" />
      <Row label="Brut"         value={row.patrimoine_brut}     color="#9ca3af" />
      <Row label="Portefeuille" value={row.total_portefeuille}  color="#3b82f6" />
      <Row label="Immobilier"   value={row.total_immo}          color="#E8B84B" />
      <Row label="Cash"         value={row.total_cash}          color="#71717a" />
      {row.total_dettes > 0 && (
        <Row label="Dettes"       value={-row.total_dettes}       color="#ef4444" />
      )}
      {row.progression_fire_pct !== null && (
        <div className="mt-2 pt-2 border-t border-border">
          <Row label="Progression FIRE" value={row.progression_fire_pct} color="#E8B84B" pct />
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color, pct }: { label: string; value: number; color: string; pct?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-secondary">{label}</span>
      <span className="text-sm financial-value font-medium" style={{ color }}>
        {pct ? `${value.toFixed(1)} %` : formatCurrency(value, 'EUR', { compact: true })}
      </span>
    </div>
  )
}
