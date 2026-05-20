'use client'

/**
 * Vue graphiques consolidée du portefeuille immobilier — 3 charts :
 *  1. Donut : repartition de la valeur du portefeuille
 *  2. Barres horizontales : cash-flow mensuel par bien (vert/rouge selon signe)
 *  3. Aire : projection patrimoine net (valeur - CRD) sur 20 ans
 *
 * La projection patrimoine est une simple courbe lineaire approximative :
 *  - valeur projetee = valeur courante × (1 + propertyIndex)^year
 *    (propertyIndex moyen = 1 % par defaut)
 *  - CRD projete = CRD courant × (1 - year/30) (lineaire approximatif 30 ans)
 *  Cette projection est volontairement simplifiee pour rester lisible
 *  cote portefeuille — la vraie projection par bien est dans simulation-panel.
 */

import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import type { RealEstatePortfolioSummary } from '@/lib/real-estate/portfolio-summary'

const PALETTE = [
  '#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899',
  '#06b6d4', '#84cc16', '#ef4444', '#6366f1', '#eab308',
]

interface Props {
  summary: RealEstatePortfolioSummary
}

export function PropertiesChartsView({ summary }: Props) {
  // Pas de chart si vide
  if (summary.properties.length === 0) return null

  const totalValue = summary.totalCurrentValue

  // ─── Donut ──────────────────────────────────────────────────────────
  const donutData = summary.properties
    .filter(p => p.currentValue > 0)
    .map((p, i) => ({
      name:  p.name,
      value: p.currentValue,
      pct:   totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0,
      color: PALETTE[i % PALETTE.length]!,
    }))

  // ─── Barres CF par bien (triees du + positif au + negatif) ──────────
  const cashflowData = [...summary.properties]
    .map(p => ({
      name: p.name,
      cf:   Math.round(p.monthlyNetCashFlow),
      tone: p.monthlyNetCashFlow >= 0 ? '#10b981' : '#ef4444',
    }))
    .sort((a, b) => b.cf - a.cf)

  // ─── Projection patrimoine net sur 20 ans ──────────────────────────
  const projection: Array<{ year: number; value: number; debt: number; net: number }> = []
  for (let year = 0; year <= 20; year++) {
    // Indexation moyenne 1 %/an (defaut)
    const projectedValue = totalValue * Math.pow(1.01, year)
    // CRD : amortissement lineaire sur 25 ans (approximation portfolio-level)
    const projectedDebt = Math.max(0, summary.totalDebt * (1 - year / 25))
    projection.push({
      year,
      value: Math.round(projectedValue),
      debt:  Math.round(projectedDebt),
      net:   Math.round(projectedValue - projectedDebt),
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ─── 1. Donut repartition valeur ───────────────────────────── */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-primary mb-1">Répartition de la valeur</h3>
        <p className="text-xs text-muted mb-4">Part de chaque bien dans le patrimoine total</p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={50}
                outerRadius={95}
                paddingAngle={2}
              >
                {donutData.map((d) => <Cell key={d.name} fill={d.color} stroke="none" />)}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-3 space-y-1 text-xs">
          {donutData.map(d => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="text-primary flex-1 truncate">{d.name}</span>
              <span className="text-muted financial-value">
                {formatCurrency(d.value, 'EUR', { compact: true })}
              </span>
              <span className="text-muted w-12 text-right">{d.pct.toFixed(0)} %</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ─── 2. Barres CF par bien ─────────────────────────────────── */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-primary mb-1">Cash-flow mensuel par bien</h3>
        <p className="text-xs text-muted mb-4">Vert : positif · Rouge : effort d&apos;épargne</p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashflowData} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="#1f2937" horizontal={false} />
              <XAxis
                type="number"
                stroke="#71717a"
                tick={{ fontSize: 11 }}
                tickFormatter={v => `${v}€`}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#71717a"
                tick={{ fontSize: 11 }}
                width={110}
              />
              <ReferenceLine x={0} stroke="#71717a" strokeWidth={1.5} />
              <Tooltip content={<CfTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="cf" radius={[0, 3, 3, 0]}>
                {cashflowData.map((d, i) => <Cell key={i} fill={d.tone} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── 3. Projection patrimoine net 20 ans (pleine largeur) ──── */}
      <div className="card p-4 lg:col-span-2">
        <h3 className="text-sm font-medium text-primary mb-1">Projection patrimoine net — 20 ans</h3>
        <p className="text-xs text-muted mb-4">
          Valeur estimée × indexation 1 %/an − CRD restant projeté (amortissement linéaire 25 ans).
          Pour des projections détaillées par bien, consultez l&apos;onglet Rentabilité de chaque fiche.
        </p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={v => `An ${v}`} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`} />
              <Tooltip content={<ProjectionTooltip />} />
              <Area type="monotone" dataKey="value" name="Valeur"        stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="debt"  name="Dette restante" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.10} strokeWidth={2} />
              <Area type="monotone" dataKey="net"   name="Patrimoine net" stroke="#10b981" fill="#10b981" fillOpacity={0.20} strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Tooltips ──────────────────────────────────────────────────────────

interface AnyPayload { active?: boolean; payload?: Array<{ payload?: Record<string, unknown> }> }

function DonutTooltip({ active, payload }: AnyPayload) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { name: string; value: number; pct: number } | undefined
  if (!d) return null
  return (
    <div className="bg-surface-2 border border-border rounded px-3 py-2 text-xs">
      <p className="text-primary font-medium">{d.name}</p>
      <p className="text-secondary mt-1">
        <span className="financial-value text-primary">{formatCurrency(d.value, 'EUR')}</span>
        <span className="text-muted ml-2">{d.pct.toFixed(1)} %</span>
      </p>
    </div>
  )
}

function CfTooltip({ active, payload }: AnyPayload) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { name: string; cf: number } | undefined
  if (!d) return null
  return (
    <div className="bg-surface-2 border border-border rounded px-3 py-2 text-xs">
      <p className="text-primary font-medium">{d.name}</p>
      <p className={`mt-1 financial-value ${d.cf >= 0 ? 'text-accent' : 'text-danger'}`}>
        {formatCurrency(d.cf, 'EUR', { sign: true })} / mois
      </p>
    </div>
  )
}

function ProjectionTooltip({ active, payload }: AnyPayload) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as { year: number; value: number; debt: number; net: number } | undefined
  if (!d) return null
  return (
    <div className="bg-surface-2 border border-border rounded px-3 py-2 text-xs min-w-[180px]">
      <p className="text-primary font-medium mb-1">Année {d.year}</p>
      <div className="space-y-0.5">
        <Row label="Valeur portefeuille" value={d.value} color="text-primary" />
        <Row label="Dette restante"      value={d.debt}  color="text-warning" />
        <div className="border-t border-border my-1" />
        <Row label="Patrimoine net"      value={d.net}   color="text-accent" bold />
      </div>
    </div>
  )
}

function Row({ label, value, color, bold }: {
  label: string
  value: number
  color: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`${color} ${bold ? 'font-medium' : ''} financial-value`}>
        {formatCurrency(value, 'EUR', { compact: true })}
      </span>
    </div>
  )
}
