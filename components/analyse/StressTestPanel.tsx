/**
 * Stress tests FIRE — panel interactif intégré sous la Projection.
 *
 * 6 cartes scénarios à sélectionner (une seule active à la fois). Quand
 * un scénario est sélectionné, on calcule simulerStress() en mémo et
 * on affiche :
 *   - Bandeau choc immédiat (perte € + durée)
 *   - 4 KPIs résultat (retard, récupération, patrimoine, objectif atteint)
 *   - Graphique comparatif baseline vs stressée avec ReferenceArea sur le choc
 *   - Message de résilience (vert si objectif atteint, orange sinon)
 *
 * Pure UI — toute la logique métier est dans lib/analyse/stressTest.ts.
 * Calculs 100 % client en useMemo.
 */
'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { ShieldAlert, TrendingDown, Hourglass, Target, Check, X } from 'lucide-react'
import {
  simulerStress, SCENARIOS_STRESS,
  type ScenarioStress, type ResultatStress,
} from '@/lib/analyse/stressTest'
import { formatCurrency } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import type { ProjectionGlobaleResult, AnneeProjection } from '@/types/analyse'

interface Props {
  /** Projection NORMALE déjà calculée par le composant parent (réutilisée
   *  pour la baseline et la superposition graphique). */
  projectionBase:        ProjectionGlobaleResult
  age_actuel:            number
  age_cible:             number
  cible_fire:            number
  revenu_passif_cible:   number
  rendement_central_pct: number
  swr_pct:               number
  inflation_pct:         number
  total_portefeuille:    number
  total_immo:            number
  total_cash:            number
  epargne_mensuelle:     number
  /** Loyers nets mensuels actuels (= revenuPassifImmo). */
  revenu_loyers:         number
}

const CHART_HEIGHT = 280

export function StressTestPanel(props: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedScenario = useMemo(
    () => SCENARIOS_STRESS.find((s) => s.id === selectedId) ?? null,
    [selectedId],
  )

  const resultat = useMemo<ResultatStress | null>(() => {
    if (!selectedScenario) return null
    return simulerStress({
      scenario:           selectedScenario,
      projectionBase:     props.projectionBase,
      patrimoine_actuel: {
        total_portefeuille: props.total_portefeuille,
        total_immo:         props.total_immo,
        total_cash:         props.total_cash,
        epargne_mensuelle:  props.epargne_mensuelle,
        revenu_loyers:      props.revenu_loyers,
      },
      age_actuel:            props.age_actuel,
      age_cible:             props.age_cible,
      cible_fire:            props.cible_fire,
      revenu_passif_cible:   props.revenu_passif_cible,
      rendement_central_pct: props.rendement_central_pct,
      swr_pct:               props.swr_pct,
      inflation_pct:         props.inflation_pct,
      horizon_annees:        Math.max(5, props.age_cible - props.age_actuel + 5),
    })
  }, [selectedScenario, props])

  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-primary flex items-center gap-2">
          <ShieldAlert size={14} className="text-warning" />
          Résistance au stress
        </h2>
        <p className="text-xs text-secondary mt-0.5">
          Simulez l&apos;impact d&apos;une crise sur votre trajectoire FIRE. Cliquez sur un scénario pour voir l&apos;effet.
        </p>
      </div>

      {/* ─── Grille des 6 scénarios ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {SCENARIOS_STRESS.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            active={selectedId === s.id}
            onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
          />
        ))}
      </div>

      {/* ─── Résultats du scénario actif ─── */}
      {selectedScenario && resultat && (
        <StressResults
          scenario={selectedScenario}
          resultat={resultat}
          baselinePoints={props.projectionBase.points}
          age_actuel={props.age_actuel}
          age_cible={props.age_cible}
          cible_fire={props.cible_fire}
          epargne_mensuelle={props.epargne_mensuelle}
          swr_pct={props.swr_pct}
        />
      )}

      {/* ─── Disclaimer ─── */}
      <p className="mt-4 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
        ⚠ Simulations indicatives. Les scénarios sont des paramètres fixes destinés à tester la résilience
        de votre patrimoine. Ils ne prédisent pas l&apos;avenir et ne tiennent pas compte de votre comportement
        adaptatif en cas de crise (réduction des dépenses, recherche de revenus complémentaires…).
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Carte scénario (sélectionnable)
// ─────────────────────────────────────────────────────────────────

function ScenarioCard({ scenario, active, onClick }: {
  scenario: ScenarioStress
  active:   boolean
  onClick:  () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left rounded-lg border px-4 py-3 transition-colors '
        + (active
          ? 'border-accent bg-accent-muted'
          : 'border-border bg-surface-2 hover:border-border-2')
      }
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-primary truncate">
          <span className="mr-1.5">{scenario.icone}</span>
          {scenario.label}
        </span>
        {active && (
          <span className="text-[10px] text-accent uppercase tracking-widest font-semibold whitespace-nowrap">
            Actif
          </span>
        )}
      </div>
      <p className="text-xs text-secondary leading-relaxed">{scenario.description}</p>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Résultats (bandeau, KPIs, graphique, message)
// ─────────────────────────────────────────────────────────────────

function StressResults({
  scenario, resultat, baselinePoints, age_actuel, age_cible, cible_fire,
  epargne_mensuelle, swr_pct,
}: {
  scenario:          ScenarioStress
  resultat:          ResultatStress
  baselinePoints:    AnneeProjection[]
  age_actuel:        number
  age_cible:         number
  cible_fire:        number
  epargne_mensuelle: number
  swr_pct:           number
}) {
  // Fusionne les 2 courbes (baseline.total + stressée) par âge pour le AreaChart
  const chartData = useMemo(() => {
    const stressedByAge = new Map<number, number>()
    for (const p of resultat.courbe_stressee) stressedByAge.set(p.age, p.valeur)
    return baselinePoints.map((p) => ({
      age:      p.age,
      baseline: p.total,
      stressed: stressedByAge.get(p.age) ?? null,
    }))
  }, [baselinePoints, resultat])

  // Patrimoine baseline à l'âge cible
  const baselineAgeCible = baselinePoints.find((p) => p.age === age_cible)?.total ?? 0
  // Delta vs cible FIRE pour le message de résilience
  const deltaPatrimoineMancant = Math.max(0, cible_fire - resultat.patrimoine_a_age_cible)
  // Épargne mensuelle additionnelle nécessaire (estimation grossière) :
  //   delta / nb_mois_jusqua_age_cible (sans tenir compte du rendement = pessimiste)
  const moisJusquAgeCible    = Math.max(1, (age_cible - age_actuel) * 12)
  const epargneAdditionnelle = Math.round(deltaPatrimoineMancant / moisJusquAgeCible)

  return (
    <div className="space-y-4 mt-5 pt-5 border-t border-border">
      {/* Bandeau choc immédiat */}
      <div className="rounded-lg border-l-4 border-l-danger bg-danger/10 px-4 py-3">
        <p className="text-sm text-primary">
          <span className="font-medium">Choc immédiat : </span>
          <span className="text-danger font-semibold financial-value">
            {resultat.perte_immediate > 0
              ? `−${formatCurrency(resultat.perte_immediate, 'EUR')}`
              : 'Pas de perte instantanée'}
          </span>
          {resultat.perte_immediate > 0 && ' sur votre patrimoine'}
        </p>
        <p className="text-xs text-secondary mt-1">
          Durée estimée : <span className="financial-value">{scenario.impact.duree_mois} mois</span> avant retour à la normale
          (+12 mois de récupération graduelle)
        </p>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBlock
          icon={<Hourglass size={12} className="text-warning" />}
          label="Retard FIRE"
          value={
            resultat.retard_mois === null
              ? 'Inatteignable'
              : resultat.retard_mois === 0
              ? 'Objectif maintenu'
              : `+${resultat.retard_mois} mois`
          }
          tone={resultat.retard_mois === null || (resultat.retard_mois ?? 0) > 12
            ? 'danger'
            : resultat.retard_mois === 0 ? 'success' : 'warning'}
        />
        <KpiBlock
          icon={<TrendingDown size={12} className="text-warning" />}
          label="Récupération"
          value={
            resultat.annees_recuperation === null
              ? 'Jamais'
              : `${resultat.annees_recuperation.toFixed(1)} ans`
          }
          tone={resultat.annees_recuperation === null
            ? 'danger'
            : resultat.annees_recuperation < 3 ? 'success' : 'warning'}
        />
        <KpiBlock
          icon={<Target size={12} className="text-accent" />}
          label={`Patrimoine à ${age_cible} ans`}
          value={formatCurrency(resultat.patrimoine_a_age_cible, 'EUR', { compact: true })}
          sub={`vs ${formatCurrency(baselineAgeCible, 'EUR', { compact: true })} normal`}
        />
        <KpiBlock
          icon={resultat.objectif_atteint
            ? <Check size={12} className="text-accent" />
            : <X size={12} className="text-danger" />}
          label="Objectif FIRE"
          value={resultat.objectif_atteint ? 'Atteint ✓' : 'Compromis ✗'}
          tone={resultat.objectif_atteint ? 'success' : 'danger'}
        />
      </div>

      {/* Graphique comparatif */}
      <div style={{ width: '100%', height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gBaseline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gStressed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.30} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#222" strokeDasharray="3 3" />
            <XAxis dataKey="age" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis
              tickFormatter={(v) => formatCurrency(v as number, 'EUR', { compact: true })}
              tick={{ fill: '#71717a', fontSize: 11 }} width={70}
            />
            <Tooltip
              formatter={(v: number) => formatCurrency(v, 'EUR', { compact: true })}
              labelFormatter={(age) => `${age} ans`}
              contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8 }}
              labelStyle={{ color: '#f4f4f5' }}
              itemStyle={{ color: '#f4f4f5' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
            {/* Zone de choc (rectangle rouge transparent) */}
            <ReferenceArea
              x1={resultat.phase_choc.age_debut}
              x2={resultat.phase_choc.age_fin}
              fill="#ef4444"
              fillOpacity={0.08}
              stroke="#ef4444"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
            {/* Âge cible */}
            <ReferenceLine x={age_cible} stroke="#71717a" strokeDasharray="3 3"
              label={{ value: 'Âge cible', fill: '#71717a', fontSize: 11, position: 'top' }} />
            <Area
              type="monotone" dataKey="baseline" name="Trajectoire normale"
              stroke="#10b981" fill="url(#gBaseline)" strokeWidth={2}
              connectNulls
            />
            <Area
              type="monotone" dataKey="stressed" name={`Avec ${scenario.label}`}
              stroke="#ef4444" fill="url(#gStressed)" strokeWidth={2}
              strokeDasharray="6 3"
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Message de résilience */}
      {resultat.objectif_atteint ? (
        <div className="rounded-lg border-l-4 border-l-accent bg-accent-muted px-4 py-3">
          <p className="text-sm text-primary">
            <span className="text-accent font-medium">✅ Votre patrimoine résiste à ce scénario.</span>
            {resultat.retard_mois !== null && resultat.retard_mois > 0
              ? ` Vous atteignez votre FIRE avec ${resultat.retard_mois} mois de retard.`
              : ' Votre âge d\'indépendance est préservé.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border-l-4 border-l-warning bg-warning-muted px-4 py-3">
          <p className="text-sm text-primary">
            <span className="text-warning font-medium">⚠ Ce scénario compromet votre objectif FIRE initial.</span>
          </p>
          <p className="text-xs text-secondary mt-1.5 leading-relaxed">
            Pour y résister, il faudrait{' '}
            <span className="text-primary financial-value font-medium">
              {formatCurrency(deltaPatrimoineMancant, 'EUR', { compact: true })}
            </span>{' '}
            de patrimoine supplémentaire, ou augmenter votre épargne de{' '}
            <span className="text-primary financial-value font-medium">
              ~{formatCurrency(epargneAdditionnelle, 'EUR', { decimals: 0 })}/m
            </span>{' '}
            (actuellement {formatCurrency(epargne_mensuelle, 'EUR', { decimals: 0 })}/m, SWR {swr_pct.toFixed(1)} %).
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI Block
// ─────────────────────────────────────────────────────────────────

function KpiBlock({ icon, label, value, sub, tone }: {
  icon:  React.ReactNode
  label: string
  value: string
  sub?:  string
  tone?: 'success' | 'warning' | 'danger'
}) {
  const valueColor =
    tone === 'success' ? 'text-accent' :
    tone === 'danger'  ? 'text-danger' :
    tone === 'warning' ? 'text-warning' :
                         'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest">
        {icon}<span className="truncate">{label}</span>
      </div>
      <p className={`text-base font-semibold financial-value mt-1.5 ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted truncate mt-0.5">{sub}</p>}
    </div>
  )
}
