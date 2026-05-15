/**
 * Section "Projection FIRE interactive" — chart 3 scénarios + sliders.
 *
 * Tout le calcul est fait CÔTÉ CLIENT via `simulerProjection()` (lib pure).
 * Les sliders rappellent la fonction à chaque change → recalcul instantané.
 */
'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Sparkles, TrendingUp, Target } from 'lucide-react'
import { simulerProjection, calculerImpactEpargne } from '@/lib/analyse/projectionFIRE'
import { formatCurrency } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props {
  patrimoine: PatrimoineComplet
}

export function ProjectionFIRE({ patrimoine }: Props) {
  const fi = patrimoine.fireInputs

  // Si on n'a pas l'âge OU la cible, on ne peut rien projeter — message
  // explicite et incitation à compléter le profil.
  if (!fi.age || !fi.age_cible || fi.revenu_passif_cible <= 0) {
    return (
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-2">Projection FIRE</p>
        <p className="text-sm text-secondary">
          Complétez votre profil (âge, âge cible, revenu passif visé) dans <a href="/profil" className="text-accent underline">Profil investisseur</a> pour activer la projection.
        </p>
      </div>
    )
  }

  // ── État local (sliders) ─────────────────────────────────────────
  const [epargne,     setEpargne]   = useState<number>(fi.epargne_mensuelle)
  const [rendement,   setRendement] = useState<number>(Math.max(3, Math.min(12, patrimoine.rendementEstime || 5)))
  const [revenuCible, setRevenuCible] = useState<number>(fi.revenu_passif_cible)

  // ── Simulations ─────────────────────────────────────────────────
  const result = useMemo(() => simulerProjection({
    patrimoineActuel:    patrimoine.totalNet,
    epargneMensuelle:    epargne,
    rendementCentral:    rendement,
    ageActuel:           fi.age!,
    ageCible:            fi.age_cible!,
    revenuPassifCible:   revenuCible,
  }), [patrimoine.totalNet, epargne, rendement, revenuCible, fi.age, fi.age_cible])

  // Impact d'augmenter l'épargne de 200 €/mois → label informatif
  const impact200 = useMemo(() => calculerImpactEpargne({
    patrimoineActuel:    patrimoine.totalNet,
    epargneMensuelle:    epargne,
    rendementCentral:    rendement,
    ageActuel:           fi.age!,
    ageCible:            fi.age_cible!,
    revenuPassifCible:   revenuCible,
  }, 200), [patrimoine.totalNet, epargne, rendement, revenuCible, fi.age, fi.age_cible])

  const cible = revenuCible * 12 * 25
  const onTime = result.ageIndependanceCentral !== null && result.ageIndependanceCentral <= fi.age_cible

  return (
    <div className="card p-5">
      <div className="mb-4">
        <p className="text-xs text-secondary uppercase tracking-widest">Projection FIRE</p>
        <p className="text-xs text-muted mt-0.5">3 scénarios — pessimiste, central, optimiste</p>
      </div>

      {/* 3 cartes résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <SummaryCard
          icon={<Sparkles size={12} className="text-accent" />}
          label="Scénario central"
          value={result.ageIndependanceCentral !== null ? `${result.ageIndependanceCentral} ans` : 'Hors horizon'}
          sub={result.ageIndependanceCentral !== null ? 'Indépendance financière' : 'Au-delà de 35 ans'}
        />
        <SummaryCard
          icon={<Target size={12} className={onTime ? 'text-accent' : 'text-warning'} />}
          label="Vs objectif"
          value={result.ecartObjectif === null ? '—' : (
            result.ecartObjectif <= 0 ? `${-result.ecartObjectif} an${-result.ecartObjectif > 1 ? 's' : ''} d'avance` : `${result.ecartObjectif} an${result.ecartObjectif > 1 ? 's' : ''} de retard`
          )}
          sub={`Cible : ${fi.age_cible} ans`}
          accent={onTime ? 'success' : 'warning'}
        />
        <SummaryCard
          icon={<TrendingUp size={12} className="text-secondary" />}
          label={`Patrimoine à ${fi.age_cible} ans`}
          value={formatCurrency(result.patrimoineAgeCible, 'EUR', { compact: true })}
          sub={`${formatCurrency(cible, 'EUR', { compact: true })} requis`}
        />
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={result.points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="optG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cenG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="pesG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#222" strokeDasharray="3 3" />
            <XAxis dataKey="age" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis tickFormatter={(v) => formatCurrency(v as number, 'EUR', { compact: true })} tick={{ fill: '#71717a', fontSize: 11 }} width={70} />
            <Tooltip
              formatter={(v: number) => formatCurrency(v, 'EUR', { compact: true })}
              labelFormatter={(age) => `${age} ans`}
              contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8 }}
              labelStyle={{ color: '#f4f4f5' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
            <Area type="monotone" dataKey="optimiste"  name="Optimiste"  stroke="#10b981" fill="url(#optG)" strokeWidth={2} />
            <Area type="monotone" dataKey="central"    name="Central"    stroke="#3b82f6" fill="url(#cenG)" strokeWidth={2} />
            <Area type="monotone" dataKey="pessimiste" name="Pessimiste" stroke="#ef4444" fill="url(#pesG)" strokeWidth={2} />
            <ReferenceLine y={cible} stroke="#E8B84B" strokeDasharray="5 5" label={{ value: 'Cible FIRE', fill: '#E8B84B', fontSize: 11, position: 'right' }} />
            <ReferenceLine x={fi.age_cible} stroke="#71717a" strokeDasharray="3 3" label={{ value: 'Âge cible', fill: '#71717a', fontSize: 11, position: 'top' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Sliders */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Slider
          label="Épargne mensuelle"
          value={epargne}
          min={0} max={5000} step={50}
          format={(v) => formatCurrency(v, 'EUR', { decimals: 0 })}
          onChange={setEpargne}
        />
        <Slider
          label="Rendement annuel"
          value={rendement}
          min={3} max={12} step={0.5}
          format={(v) => `${v.toFixed(1)} %`}
          onChange={setRendement}
        />
        <Slider
          label="Revenu passif cible"
          value={revenuCible}
          min={1000} max={10000} step={100}
          format={(v) => `${formatCurrency(v, 'EUR', { decimals: 0 })} / mois`}
          onChange={setRevenuCible}
        />
      </div>

      {/* Impact informatif */}
      {impact200 > 0 && (
        <div className="mt-4 bg-accent-muted border border-accent/30 rounded-lg px-3 py-2 text-xs text-primary">
          💡 En ajoutant <span className="text-accent font-medium">200 €/mois</span> à votre épargne, vous gagneriez environ <span className="text-accent font-medium">{impact200.toFixed(1)} an{impact200 >= 2 ? 's' : ''}</span> sur votre objectif FIRE.
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  accent?: 'success' | 'warning'
}) {
  const color = accent === 'success' ? 'text-accent' : accent === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest">
        {icon}<span>{label}</span>
      </div>
      <p className={`text-base font-semibold financial-value mt-1.5 ${color}`}>{value}</p>
      <p className="text-[10px] text-muted">{sub}</p>
    </div>
  )
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <label className="text-xs text-secondary">{label}</label>
        <span className="text-xs text-accent financial-value">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#10b981] cursor-pointer"
      />
    </div>
  )
}
