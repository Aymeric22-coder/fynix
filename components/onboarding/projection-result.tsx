/**
 * Écran de résultat de l'onboarding 60 secondes — l'« aha moment ».
 *
 * Reçoit le résultat pré-calculé par `calculerQuickProjection` côté
 * client et l'affiche : headline + 3 métriques + graphique trajectoire
 * + accordéon hypothèses + 2 CTAs (dashboard / wizard d'affinement).
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { formatEur } from '@/lib/utils/format'
import type { QuickProjectionResult } from '@/lib/onboarding/quickProjection'
import { QUICK_HYPOTHESES } from '@/lib/onboarding/quickProjection'

interface Props {
  /** Résultat pré-calculé côté client. */
  result:           QuickProjectionResult
  /** Inputs originaux — utilisés pour la sauvegarde fire-and-forget. */
  inputs: {
    age:              number
    patrimoineActuel: number
    revenuMensuelNet: number
  }
}

export function ProjectionResult({ result, inputs }: Props) {
  const router = useRouter()
  const [hypothesesOuvertes, setHypothesesOuvertes] = useState(false)
  const [saving, setSaving] = useState(false)

  const atteint = result.ageIndependance !== null

  function handleStartTracking() {
    setSaving(true)
    // Fire-and-forget : on n'attend pas la réponse pour naviguer.
    fetch('/api/onboarding/quick-save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(inputs),
    }).catch(() => { /* silent */ })
    router.push('/dashboard')
  }

  function handleAffiner() {
    setSaving(true)
    fetch('/api/onboarding/quick-save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(inputs),
    }).catch(() => { /* silent */ })
    router.push('/profil')
  }

  return (
    <div className="space-y-7">
      {/* ─── Headline (l'aha moment) ─── */}
      <section className="text-center space-y-2">
        <Sparkles size={20} className="text-accent mx-auto" />
        {atteint ? (
          <>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary leading-tight">
              Tu pourrais être financièrement libre à{' '}
              <span className="text-accent">{result.ageIndependance} ans</span>
            </h1>
            <p className="text-sm text-secondary">
              Dans {result.anneesRestantes} ans, si tu épargnes régulièrement.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary leading-tight">
              Avec quelques ajustements, l&apos;indépendance est à portée
            </h1>
            <p className="text-sm text-secondary">
              Affine ta projection pour voir ce qui change avec tes vrais actifs et ton vrai taux d&apos;épargne.
            </p>
          </>
        )}
      </section>

      {/* ─── 3 métriques secondaires ─── */}
      <section className="grid grid-cols-3 gap-3">
        <Metric label="Patrimoine visé" value={formatEur(result.patrimoineNecessaire, { decimals: 0 })} />
        <Metric label="Épargne estimée" value={`${formatEur(result.epargneMensuelleEstimee, { decimals: 0 })}/mois`} />
        <Metric label="Taux d'épargne"  value={`${result.tauxEpargnePct.toFixed(0)} %`} />
      </section>

      {/* ─── Graphique trajectoire ─── */}
      <section className="card p-4">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">
          Trajectoire patrimoniale
        </p>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart
              data={result.trajectoire}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid stroke="#222" strokeDasharray="3 3" />
              <XAxis
                dataKey="age"
                stroke="#71717a"
                fontSize={11}
                tickFormatter={(v: number) => `${v} a`}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickFormatter={(v: number) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`
                  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} k`
                  return `${v}`
                }}
              />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#71717a' }}
                formatter={(value: number) => [formatEur(value, { decimals: 0 }), 'Patrimoine']}
                labelFormatter={(age: number) => `Âge ${age} ans`}
              />
              <ReferenceLine
                y={result.patrimoineNecessaire}
                stroke="#E8B84B"
                strokeDasharray="4 4"
                label={{ value: 'Objectif', position: 'insideTopRight', fill: '#E8B84B', fontSize: 10 }}
              />
              {atteint && (
                <ReferenceDot
                  x={result.ageIndependance!}
                  y={result.patrimoineNecessaire}
                  r={5}
                  fill="#10b981"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )}
              <Line
                type="monotone"
                dataKey="patrimoine"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ─── Accordéon hypothèses ─── */}
      <section>
        <button
          type="button"
          onClick={() => setHypothesesOuvertes((v) => !v)}
          aria-expanded={hypothesesOuvertes}
          className="w-full inline-flex items-center justify-between px-3 py-2 rounded-lg
                     bg-surface-2 border border-border text-xs text-secondary
                     hover:text-primary transition-colors"
        >
          <span>Ces estimations supposent…</span>
          {hypothesesOuvertes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {hypothesesOuvertes && (
          <ul className="mt-3 space-y-1.5 text-xs text-secondary leading-relaxed px-2">
            <li>
              <strong className="text-primary">Épargne mensuelle :</strong>{' '}
              {formatEur(result.epargneMensuelleEstimee, { decimals: 0 })}
              {' '}({(QUICK_HYPOTHESES.tauxEpargne * 100).toFixed(0)} % de ton revenu net)
            </li>
            <li>
              <strong className="text-primary">Rendement annuel :</strong>{' '}
              {(QUICK_HYPOTHESES.rendementAnnuel * 100).toFixed(0)} % (médiane historique ETF Monde)
            </li>
            <li>
              <strong className="text-primary">Revenu cible à l&apos;indépendance :</strong>{' '}
              {(QUICK_HYPOTHESES.revenuCible * 100).toFixed(0)} % de ton revenu actuel
            </li>
            <li>
              <strong className="text-primary">Inflation :</strong>{' '}
              {(QUICK_HYPOTHESES.inflationAnnuelle * 100).toFixed(0)} %/an (cible BCE)
            </li>
            <li>
              <strong className="text-primary">Taux de retrait sécurisé :</strong>{' '}
              {(QUICK_HYPOTHESES.swrPct * 100).toFixed(1)} % (règle des 25× / Trinity Study)
            </li>
          </ul>
        )}
      </section>

      {/* ─── CTAs ─── */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={handleStartTracking}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg
                     bg-accent text-white font-semibold text-base
                     hover:bg-accent-hover transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Commencer à tracker mon patrimoine
        </button>
        <button
          type="button"
          onClick={handleAffiner}
          disabled={saving}
          className="w-full px-4 py-3 rounded-lg border border-border bg-transparent
                     text-primary text-sm font-medium
                     hover:border-accent/40 hover:bg-accent/5 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Affiner ma projection
          <span className="block text-xs text-muted mt-0.5 font-normal">
            Renseigne tes actifs réels, ton TMI, tes biens immobiliers
          </span>
        </button>
      </section>

      {/* ─── Disclaimer ─── */}
      <p className="text-[11px] text-muted italic text-center leading-relaxed">
        Ces projections sont indicatives et basées sur des hypothèses simplifiées.
        Elles ne constituent pas un conseil financier.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composant Metric
// ─────────────────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-base sm:text-lg font-semibold financial-value text-primary leading-tight">
        {value}
      </p>
      <p className="text-[10px] text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}
