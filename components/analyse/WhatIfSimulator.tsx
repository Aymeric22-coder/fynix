/**
 * Simulateur What-if — 3 scénarios interactifs.
 *
 * Tâche 3 : permet à l'utilisateur de tester l'impact d'une décision sans
 * toucher à son patrimoine réel. Calculs 100 % client (pas d'I/O), résultats
 * mis à jour en temps réel sur chaque mouvement de slider.
 *
 * Tabs :
 *   1. Épargne     — slider +X €/mois → mois gagnés
 *   2. Immobilier  — paramètres d'un bien → cashflow + impact FIRE
 *   3. Allocation  — sliders par classe → patrimoine à 5/10/20 ans
 */
'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine,
} from 'recharts'
import { PiggyBank, Home, Layers, ArrowRight } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { Field, Input, FormGrid } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'
import {
  simulerEpargneDelta, simulerNouvelleAcquisition, simulerChangementRendement,
  type AllocationClasse,
} from '@/lib/analyse/whatif'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props {
  patrimoine: PatrimoineComplet
}

export function WhatIfSimulator({ patrimoine }: Props) {
  const tabs: TabItem[] = [
    { id: 'epargne',    label: 'Épargne',    icon: <PiggyBank size={14} />, content: <EpargneTab patrimoine={patrimoine} /> },
    { id: 'immo',       label: 'Immobilier', icon: <Home size={14} />,      content: <ImmoTab patrimoine={patrimoine} /> },
    { id: 'allocation', label: 'Allocation', icon: <Layers size={14} />,    content: <AllocationTab patrimoine={patrimoine} /> },
  ]
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-secondary uppercase tracking-widest">Simulateur What-if</p>
        <p className="text-xs text-muted mt-0.5">
          Testez l&apos;impact d&apos;une décision sans toucher à votre patrimoine réel.
          Tous les calculs sont effectués localement, en temps réel.
        </p>
      </div>
      <Tabs tabs={tabs} urlParam="whatif" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Épargne
// ─────────────────────────────────────────────────────────────────

function EpargneTab({ patrimoine }: { patrimoine: PatrimoineComplet }) {
  const [delta, setDelta] = useState(200)

  const result = useMemo(() => simulerEpargneDelta({
    patrimoineActuel:    patrimoine.totalNet,
    epargneMensuelle:    patrimoine.fireInputs.epargne_mensuelle,
    rendementCentral:    Math.max(patrimoine.rendementEstime, 5),
    ageActuel:           patrimoine.fireInputs.age ?? 30,
    ageCible:            patrimoine.fireInputs.age_cible ?? 55,
    // QW9 — Cible AJUSTÉE composition foyer (cf. aggregateur > loadProfile).
    revenuPassifCible:   patrimoine.fireInputs.revenu_passif_cible_ajuste,
    // P1 — SWR du fire_type pour cohérence lean/standard/fat avec la projection.
    fireType:            (patrimoine.fireInputs as { fire_type?: string | null }).fire_type,
    deltaEpargneMensuel: delta,
  }), [patrimoine, delta])

  const ageAvant = result.age_fire_avant
  const ageApres = result.age_fire_apres
  const moisGagnes = result.mois_gagnes

  return (
    <div className="card p-5 space-y-5">
      <div>
        <label className="text-xs text-secondary uppercase tracking-widest">
          Si j&apos;augmente mon épargne de
        </label>
        <div className="flex items-center justify-between gap-4 mt-2">
          <input
            type="range"
            min={0} max={1000} step={50}
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-lg font-semibold text-accent financial-value w-28 text-right">
            +{delta} €/mois
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="Âge FIRE actuel"
          value={ageAvant !== null ? `${ageAvant.toFixed(1)} ans` : '—'}
          sub={`épargne ${patrimoine.fireInputs.epargne_mensuelle} €/mois`}
        />
        <KpiCard
          label="Âge FIRE simulé"
          value={ageApres !== null ? `${ageApres.toFixed(1)} ans` : '—'}
          sub={`épargne ${patrimoine.fireInputs.epargne_mensuelle + delta} €/mois`}
          accent
        />
        <KpiCard
          label="Mois gagnés"
          value={
            moisGagnes === null ? '—' :
            moisGagnes > 0      ? `${moisGagnes} mois` :
                                  '0 mois'
          }
          sub={moisGagnes !== null && moisGagnes > 0 ? `~${(moisGagnes / 12).toFixed(1)} ans d'avance` : 'pas d\'impact'}
          accent={moisGagnes !== null && moisGagnes > 0}
        />
      </div>

      <p className="text-xs text-muted pt-3 border-t border-border">
        Hypothèse : rendement {Math.max(patrimoine.rendementEstime, 5).toFixed(1)} %/an,
        cible patrimoine {formatCurrency(result.cible_capital, 'EUR', { compact: true })}.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Immobilier
// ─────────────────────────────────────────────────────────────────

function ImmoTab({ patrimoine }: { patrimoine: PatrimoineComplet }) {
  const [prix,     setPrix]     = useState(200_000)
  const [loyer,    setLoyer]    = useState(900)
  const [charges,  setCharges]  = useState(150)
  const [apport,   setApport]   = useState(40_000)
  const [taux,     setTaux]     = useState(3.5)
  const [duree,    setDuree]    = useState(20)

  const result = useMemo(() => simulerNouvelleAcquisition({
    patrimoineActuel:    patrimoine.totalNet,
    epargneMensuelle:    patrimoine.fireInputs.epargne_mensuelle,
    rendementCentral:    Math.max(patrimoine.rendementEstime, 5),
    ageActuel:           patrimoine.fireInputs.age ?? 30,
    ageCible:            patrimoine.fireInputs.age_cible ?? 55,
    // QW9 — Cible AJUSTÉE composition foyer (cf. aggregateur > loadProfile).
    revenuPassifCible:   patrimoine.fireInputs.revenu_passif_cible_ajuste,
    // P1 — SWR du fire_type pour cohérence lean/standard/fat avec la projection.
    fireType:            (patrimoine.fireInputs as { fire_type?: string | null }).fire_type,
    prix_bien:           prix,
    loyer_mensuel:       loyer,
    charges_mensuelles:  charges,
    apport,
    taux_credit_pct:     taux,
    duree_credit_ans:    duree,
  }), [patrimoine, prix, loyer, charges, apport, taux, duree])

  const cf = result.impact_cashflow_mensuel
  const moisFire = result.impact_age_fire_mois

  return (
    <div className="card p-5 space-y-5">
      <FormGrid>
        <Field label="Prix du bien (€)">
          <Input type="number" min={0} value={prix} onChange={(e) => setPrix(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Loyer mensuel (€)">
          <Input type="number" min={0} value={loyer} onChange={(e) => setLoyer(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Charges mensuelles (€)">
          <Input type="number" min={0} value={charges} onChange={(e) => setCharges(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Apport (€)">
          <Input type="number" min={0} value={apport} onChange={(e) => setApport(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Taux crédit (% annuel)">
          <Input type="number" min={0} step={0.1} value={taux} onChange={(e) => setTaux(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Durée (années)">
          <Input type="number" min={1} max={30} value={duree} onChange={(e) => setDuree(Number(e.target.value) || 1)} />
        </Field>
      </FormGrid>

      {result.warning && (
        <p className="text-xs text-warning bg-warning-muted px-3 py-2 rounded-lg">
          ⚠ {result.warning}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="Mensualité crédit"
          value={formatCurrency(result.mensualite_credit, 'EUR')}
          sub={`${duree} ans à ${taux}%`}
        />
        <KpiCard
          label="Cashflow mensuel"
          value={formatCurrency(cf, 'EUR', { sign: true })}
          sub={cf >= 0 ? 'autofinancé' : 'effort mensuel'}
          accent={cf >= 0}
          danger={cf < 0}
        />
        <KpiCard
          label="Equity à 5 ans"
          value={formatCurrency(result.impact_patrimoine_5ans, 'EUR', { compact: true })}
          sub="appréciation 2 %/an + amorti"
          accent
        />
      </div>

      <div className={`rounded-lg border-l-4 ${cf >= 0 ? 'border-l-accent bg-accent-muted' : 'border-l-warning bg-warning-muted'} px-4 py-3`}>
        <p className="text-sm font-medium text-primary">
          {moisFire === null
            ? 'Impact sur FIRE non calculable (objectif hors horizon)'
            : moisFire > 0
            ? `Ce bien ferait avancer votre FIRE de ${moisFire} mois`
            : moisFire < 0
            ? `Ce bien retarderait votre FIRE de ${Math.abs(moisFire)} mois`
            : `Ce bien n'aurait pas d'impact sur votre âge FIRE`}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Allocation
// ─────────────────────────────────────────────────────────────────

const DEFAULT_RENDEMENTS: Record<string, number> = {
  Actions:       8,
  'ETF / Fonds': 7,
  Crypto:        12,
  Immobilier:    5,
  Cash:          2,
  Obligataire:   3,
  Métaux:        2,
}

const CLASSES_ALLOC = ['Actions', 'ETF / Fonds', 'Immobilier', 'Cash', 'Crypto', 'Obligataire']

function AllocationTab({ patrimoine }: { patrimoine: PatrimoineComplet }) {
  // Allocation actuelle : depuis patrimoine.repartitionClasses
  const allocActuelle: AllocationClasse[] = useMemo(() => {
    return CLASSES_ALLOC.map((label) => {
      const found = patrimoine.repartitionClasses.find((c) => c.label === label)
      return {
        label,
        pourcentage:   found?.pourcentage ?? 0,
        rendement_pct: DEFAULT_RENDEMENTS[label] ?? 5,
      }
    })
  }, [patrimoine])

  // État des sliders : pourcentages cibles
  const [cibles, setCibles] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    for (const a of allocActuelle) init[a.label] = Math.round(a.pourcentage)
    return init
  })

  const totalCible = Object.values(cibles).reduce((s, v) => s + v, 0)

  const allocCible: AllocationClasse[] = CLASSES_ALLOC.map((label) => ({
    label,
    pourcentage:   cibles[label] ?? 0,
    rendement_pct: DEFAULT_RENDEMENTS[label] ?? 5,
  }))

  const result = useMemo(() => simulerChangementRendement({
    patrimoineActuel:   patrimoine.totalNet,
    allocationActuelle: allocActuelle,
    allocationCible:    allocCible,
    epargneMensuelle:   patrimoine.fireInputs.epargne_mensuelle,
    horizons:           [5, 10, 20],
  }), [patrimoine, allocActuelle, allocCible])

  const chartData = result.points.map((p) => ({
    name:   `${p.annees} ans`,
    Avant:  p.avant,
    Apres:  p.apres,
  }))

  return (
    <div className="card p-5 space-y-5">
      <div className="space-y-3">
        {CLASSES_ALLOC.map((label) => {
          const value   = cibles[label] ?? 0
          const actuel  = allocActuelle.find((a) => a.label === label)?.pourcentage ?? 0
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">{label}</span>
                <span className="text-primary financial-value">
                  {value} % <span className="text-muted">vs {actuel.toFixed(0)} % actuel</span>
                </span>
              </div>
              <input
                type="range"
                min={0} max={100} step={1}
                value={value}
                onChange={(e) => setCibles({ ...cibles, [label]: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          )
        })}
      </div>

      <p className={`text-xs ${Math.abs(totalCible - 100) <= 2 ? 'text-muted' : 'text-warning'}`}>
        Total alloué : {totalCible} % {Math.abs(totalCible - 100) > 2 && '(idéalement 100 %)'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Rendement pondéré actuel"
          value={`${result.rendement_pondere_avant.toFixed(1)} %`}
          sub="moyenne pondérée"
        />
        <KpiCard
          label="Rendement pondéré simulé"
          value={`${result.rendement_pondere_apres.toFixed(1)} %`}
          sub={result.rendement_pondere_apres > result.rendement_pondere_avant ? 'plus offensif' : 'plus prudent'}
          accent={result.rendement_pondere_apres > result.rendement_pondere_avant}
        />
      </div>

      {/* Comparatif graphique 5/10/20 ans */}
      <div>
        <p className="text-xs text-secondary uppercase tracking-widest mb-2">Projection comparée</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="alloc-avant" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6b7280" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6b7280" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="alloc-apres" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={{ stroke: 'rgba(255,255,255,0.05)' }} width={50} />
            <Tooltip
              contentStyle={{ background: '#111111', border: '1px solid #222' }}
              labelStyle={{ color: '#9ca3af', fontSize: 11 }}
              formatter={(v: number, n: string) => [formatCurrency(v, 'EUR', { compact: true }), n]}
            />
            <ReferenceLine y={patrimoine.totalNet} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 4" label={{ value: 'Patrimoine actuel', position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }} />
            <Area type="monotone" dataKey="Avant" stroke="#6b7280" fill="url(#alloc-avant)" strokeWidth={1.5} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="Apres" stroke="#10b981" fill="url(#alloc-apres)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2 pt-3 border-t border-border">
        {result.points.map((p) => (
          <div key={p.annees} className="flex items-center justify-between text-xs">
            <span className="text-secondary">À {p.annees} ans</span>
            <span className="flex items-center gap-2">
              <span className="text-muted financial-value">{formatCurrency(p.avant, 'EUR', { compact: true })}</span>
              <ArrowRight size={11} className="text-accent" />
              <span className="text-primary font-medium financial-value">{formatCurrency(p.apres, 'EUR', { compact: true })}</span>
              <span className={`financial-value ml-2 ${p.gain >= 0 ? 'text-accent' : 'text-danger'}`}>
                {p.gain >= 0 ? '+' : ''}{formatCurrency(p.gain, 'EUR', { compact: true })}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI Card partagée
// ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, danger }: {
  label:  string
  value:  string
  sub?:   string
  accent?: boolean
  danger?: boolean
}) {
  const color = danger ? 'text-danger' : accent ? 'text-accent' : 'text-primary'
  return (
    <div className={`card p-4 ${accent ? 'border-accent/20' : ''}`}>
      <p className="text-xs text-secondary uppercase tracking-widest">{label}</p>
      <p className={`text-xl font-semibold financial-value mt-2 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-secondary mt-1">{sub}</p>}
    </div>
  )
}
