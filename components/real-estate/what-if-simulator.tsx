'use client'

/**
 * Simulateur what-if interactif — modifie 5 parametres et compare
 * en temps reel avec les KPIs reels du bien.
 *
 * - useMemo recalcule la simulation a chaque changement de slider
 *   (synchrone, < 50 ms typiquement)
 * - Aucun appel API : tout cote client avec les props du parent
 * - 4 scenarios predefinits (pessimiste / optimiste / hausse taux +1 / vacance 2 mois)
 * - Pour les biens courte duree : sliders adaptes (occupation + tarif nuit
 *   au lieu de loyer mensuel)
 */

import { useMemo, useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, RotateCcw, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { buildSimulationInputFromDb, runSimulation } from '@/lib/real-estate'
import type {
  DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile,
} from '@/lib/real-estate/build-from-db'
import { InfoTip } from '@/components/ui/info-tip'
import { LEXIQUE, getLexiqueDefinition } from '@/lib/real-estate/lexique'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface Props {
  property: DbProperty
  asset:    DbAsset | null
  lots:     DbLot[]
  charges:  DbCharges | null
  /** V3.1 — Multi-crédit : tous les crédits actifs (peut être []). */
  debts:    DbDebt[]
  profile:  DbProfile | null
  /** True si le bien est en location courte duree (modifie les sliders). */
  isShortTerm?: boolean
}

/**
 * Cible le crédit principal parmi un tableau de DbDebt. Retombe sur le
 * premier crédit si aucun n'a `loan_kind === 'principal'`, ou null si vide.
 */
function findPrincipal(debts: DbDebt[]): DbDebt | null {
  return debts.find(d => (d.loan_kind ?? 'principal') === 'principal') ?? debts[0] ?? null
}

interface WhatIfParams {
  monthlyRent:    number  // somme des loyers HC mensuels
  annualRatePct:  number  // taux nominal credit (%)
  vacancyMonths:  number
  annualCharges:  number  // total charges annuelles
  currentValue:   number  // valeur estimee
  // Courte duree
  occupancyRatePct?: number
  nightlyRateLow?:   number
}

interface ComparisonKpis {
  monthlyCashFlow:    number
  grossYield:         number
  netNetYield:        number
  monthlyPayment:     number
  paybackYear:        number | null
  netValue:           number
}

export function WhatIfSimulator({
  property, asset, lots, charges, debts, profile, isShortTerm,
}: Props) {
  const [open, setOpen] = useState(false)

  // ─── Base : valeurs reelles depuis la DB ────────────────────────────
  // Le slider "Taux d'intérêt" ne pilote QUE le crédit principal (les
  // crédits secondaires — PTZ, prêt travaux — gardent leur taux propre,
  // souvent fixe ou 0). Documente l'intention au-dessus du slider.
  const baseValues = useMemo(() => {
    const monthlyRent = lots
      .filter(l => l.status === 'rented')
      .reduce((s, l) => s + (l.rent_amount ?? 0), 0)
    const annualCharges = sumCharges(charges)
    const principal = findPrincipal(debts)
    return {
      monthlyRent:      property.assumed_total_rent ?? monthlyRent,
      annualRatePct:    principal?.interest_rate ?? 3.5,
      vacancyMonths:    property.vacancy_months ?? 0,
      annualCharges,
      currentValue:     asset?.current_value ?? 0,
      occupancyRatePct: 70,
      nightlyRateLow:   80,
    }
  }, [property, asset, lots, charges, debts])

  const [params, setParams] = useState<WhatIfParams>(baseValues)

  // ─── KPIs base (vraie simulation actuelle) ──────────────────────────
  const baseKpis = useMemo<ComparisonKpis>(() => {
    return runWhatIfSim(property, asset, lots, charges, debts, profile, baseValues)
  }, [property, asset, lots, charges, debts, profile, baseValues])

  // ─── KPIs scenario ──────────────────────────────────────────────────
  const whatIfKpis = useMemo<ComparisonKpis>(() => {
    return runWhatIfSim(property, asset, lots, charges, debts, profile, params)
  }, [property, asset, lots, charges, debts, profile, params])

  function setParam<K extends keyof WhatIfParams>(k: K, v: WhatIfParams[K]) {
    setParams(p => ({ ...p, [k]: v }))
  }

  function reset() { setParams(baseValues) }

  // ─── Scenarios predefinis ───────────────────────────────────────────
  function applyScenario(kind: 'pessimist' | 'optimist' | 'rate_up' | 'vacancy_2m') {
    switch (kind) {
      case 'pessimist':
        setParams({
          ...baseValues,
          monthlyRent:   Math.round(baseValues.monthlyRent * 0.92),
          annualRatePct: baseValues.annualRatePct + 0.75,
          vacancyMonths: 1.5,
          annualCharges: Math.round(baseValues.annualCharges * 1.15),
        })
        break
      case 'optimist':
        setParams({
          ...baseValues,
          monthlyRent:   Math.round(baseValues.monthlyRent * 1.08),
          vacancyMonths: 0,
          annualCharges: Math.round(baseValues.annualCharges * 0.95),
        })
        break
      case 'rate_up':
        setParams({ ...baseValues, annualRatePct: baseValues.annualRatePct + 1 })
        break
      case 'vacancy_2m':
        setParams({ ...baseValues, vacancyMonths: 2 })
        break
    }
  }

  // ─── Plages des sliders ─────────────────────────────────────────────
  const ranges = {
    monthlyRent: {
      min:  Math.max(0, Math.round(baseValues.monthlyRent * 0.7)),
      max:  Math.round(baseValues.monthlyRent * 1.3),
      step: 10,
    },
    annualRatePct: {
      min:  Math.max(0.5, baseValues.annualRatePct - 1),
      max:  baseValues.annualRatePct + 2,
      step: 0.05,
    },
    vacancyMonths: { min: 0, max: 3, step: 0.5 },
    annualCharges: {
      min:  Math.round(baseValues.annualCharges * 0.7),
      max:  Math.round(baseValues.annualCharges * 1.4),
      step: 50,
    },
    currentValue: {
      min:  Math.round(baseValues.currentValue * 0.7),
      max:  Math.round(baseValues.currentValue * 1.4),
      step: 1000,
    },
  } as const

  if (!open) {
    return (
      <div className="card p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-accent hover:text-accent/80 transition-colors"
        >
          <Sparkles size={14} />
          Simuler un scénario (what-if interactif)
          <ChevronDown size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-5 border-accent/30">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-primary flex items-center gap-2">
            <Sparkles size={14} className="text-accent" />
            Simulation de scénario
          </h3>
          <p className="text-xs text-muted mt-1">
            Modifiez les paramètres — les résultats se mettent à jour en temps réel.
            Vos données réelles ne sont pas modifiées.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false) }}
          className="text-xs text-muted hover:text-primary inline-flex items-center gap-1"
        >
          <ChevronUp size={12} /> Fermer
        </button>
      </div>

      {/* Scenarios rapides */}
      <div className="flex flex-wrap gap-2">
        <ScenarioBtn label="Scénario pessimiste"  onClick={() => applyScenario('pessimist')}  variant="warning" />
        <ScenarioBtn label="Scénario optimiste"   onClick={() => applyScenario('optimist')}   variant="positive" />
        <ScenarioBtn label="Hausse des taux +1 %" onClick={() => applyScenario('rate_up')}    variant="neutral" />
        <ScenarioBtn label="Vacance 2 mois"       onClick={() => applyScenario('vacancy_2m')} variant="neutral" />
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        <Slider
          label="Loyer mensuel"
          unit="€/mois"
          value={params.monthlyRent}
          base={baseValues.monthlyRent}
          range={ranges.monthlyRent}
          onChange={v => setParam('monthlyRent', v)}
          formatBase={v => formatCurrency(v, 'EUR')}
        />
        <Slider
          label="Taux d'intérêt"
          unit="%"
          value={params.annualRatePct}
          base={baseValues.annualRatePct}
          range={ranges.annualRatePct}
          onChange={v => setParam('annualRatePct', v)}
          formatBase={v => `${v.toFixed(2)} %`}
          decimals={2}
        />
        <Slider
          label="Mois de vacance/an"
          unit="mois"
          value={params.vacancyMonths}
          base={baseValues.vacancyMonths}
          range={ranges.vacancyMonths}
          onChange={v => setParam('vacancyMonths', v)}
          formatBase={v => `${v} mois`}
          decimals={1}
        />
        <Slider
          label="Charges annuelles"
          unit="€/an"
          value={params.annualCharges}
          base={baseValues.annualCharges}
          range={ranges.annualCharges}
          onChange={v => setParam('annualCharges', v)}
          formatBase={v => formatCurrency(v, 'EUR')}
        />
        <Slider
          label="Valeur estimée"
          unit="€"
          value={params.currentValue}
          base={baseValues.currentValue}
          range={ranges.currentValue}
          onChange={v => setParam('currentValue', v)}
          formatBase={v => formatCurrency(v, 'EUR', { compact: true })}
        />

        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary"
        >
          <RotateCcw size={11} /> Réinitialiser tous les paramètres
        </button>
      </div>

      {/* Resultats */}
      <div className="card bg-surface-2/40 p-4">
        <p className="text-[10px] uppercase tracking-wider text-secondary mb-2">
          Résultats du scénario
        </p>
        <div className="space-y-1.5 text-sm">
          <Row label="Cash-flow mensuel net" tip={LEXIQUE.monthlyCashFlow} base={baseKpis.monthlyCashFlow} value={whatIfKpis.monthlyCashFlow} format="eur" higherIsBetter />
          <Row label="Rendement brut"        tip={LEXIQUE.grossYield}      base={baseKpis.grossYield}      value={whatIfKpis.grossYield}      format="pct" higherIsBetter />
          <Row label="Rendement net-net"     tip={getLexiqueDefinition('netNetYield', property.fiscal_regime)} base={baseKpis.netNetYield}     value={whatIfKpis.netNetYield}     format="pct" higherIsBetter />
          <Row label="Mensualité crédit"     base={baseKpis.monthlyPayment}  value={whatIfKpis.monthlyPayment}  format="eur" higherIsBetter={false} />
          <Row label="Année break-even"      base={baseKpis.paybackYear ?? null} value={whatIfKpis.paybackYear ?? null} format="year" higherIsBetter={false} />
          <Row label="Valeur nette"          base={baseKpis.netValue}        value={whatIfKpis.netValue}        format="eur" higherIsBetter />
        </div>
        {isShortTerm && (
          <p className="text-[10px] text-muted mt-3 pt-2 border-t border-border">
            Bien en location courte durée — le slider &quot;Loyer mensuel&quot; correspond au revenu
            mensuel propriétaire moyen (après commissions plateformes et frais opérationnels).
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Calcul what-if ────────────────────────────────────────────────────

function sumCharges(c: DbCharges | null): number {
  if (!c) return 0
  return (c.taxe_fonciere ?? 0) + (c.insurance ?? 0) + (c.accountant ?? 0)
       + (c.cfe ?? 0) + (c.condo_fees ?? 0) + (c.maintenance ?? 0) + (c.other ?? 0)
}

/**
 * Lance une simulation avec des overrides what-if et extrait
 * les 6 KPIs de comparaison.
 */
export function runWhatIfSim(
  property: DbProperty,
  asset:    DbAsset | null,
  lots:     DbLot[],
  charges:  DbCharges | null,
  debts:    DbDebt[],
  profile:  DbProfile | null,
  params:   WhatIfParams,
): ComparisonKpis {
  // Override property et asset selon les params
  const propertyOverride: DbProperty = {
    ...property,
    assumed_total_rent: params.monthlyRent,
    vacancy_months:     params.vacancyMonths,
  }
  const assetOverride: DbAsset | null = asset
    ? { ...asset, current_value: params.currentValue }
    : null

  // Override charges : si on a des charges DB, on les scale uniformement
  // pour atteindre le total demande
  let chargesOverride: DbCharges | null = charges
  if (charges) {
    const baseTotal = sumCharges(charges)
    const ratio = baseTotal > 0 ? params.annualCharges / baseTotal : 1
    chargesOverride = {
      ...charges,
      taxe_fonciere: (charges.taxe_fonciere ?? 0) * ratio,
      insurance:     (charges.insurance ?? 0) * ratio,
      accountant:    (charges.accountant ?? 0) * ratio,
      cfe:           (charges.cfe ?? 0) * ratio,
      condo_fees:    (charges.condo_fees ?? 0) * ratio,
      maintenance:   (charges.maintenance ?? 0) * ratio,
      other:         (charges.other ?? 0) * ratio,
    }
  } else if (params.annualCharges > 0) {
    chargesOverride = {
      taxe_fonciere: 0, insurance: 0, accountant: 0, cfe: 0,
      condo_fees: 0, maintenance: 0, other: params.annualCharges,
    }
  }

  // V3.1 — Override taux : on ne modifie QUE le crédit principal. Les
  // crédits secondaires (PTZ taux 0, prêt travaux) gardent leur taux DB.
  const debtsOverride: DbDebt[] = debts.map(d =>
    (d.loan_kind ?? 'principal') === 'principal'
      ? { ...d, interest_rate: params.annualRatePct }
      : d,
  )

  // Apport = coût acquisition - somme capitaux empruntés (multi-crédit).
  const acqCost = (property.purchase_price ?? 0) + (property.purchase_fees ?? 0) + (property.works_amount ?? 0)
  const totalBorrowed = debts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)
  const downPayment = Math.max(0, acqCost - totalBorrowed)

  const input = buildSimulationInputFromDb(
    propertyOverride, assetOverride, lots, chargesOverride, debtsOverride, profile,
    { downPayment },
  )
  const result = runSimulation(input)

  const k = result.kpis
  // k.currentNetPropertyValue est deja calcule avec la valeur estimee
  // override (via assetOverride.current_value).
  return {
    monthlyCashFlow: k.monthlyCashFlowYear1,
    grossYield:      k.grossYieldFAI,
    netNetYield:     k.netNetYield,
    monthlyPayment:  k.monthlyPayment,
    paybackYear:     k.paybackYear,
    netValue:        k.currentNetPropertyValue,
  }
}

// ─── Sous-composants ───────────────────────────────────────────────────

function Slider({ label, unit, value, base, range, onChange, formatBase, decimals }: {
  label: string
  unit:  string
  value: number
  base:  number
  range: { min: number; max: number; step: number }
  onChange:   (v: number) => void
  formatBase: (v: number) => string
  decimals?:  number
}) {
  const display = decimals != null ? value.toFixed(decimals) : Math.round(value).toString()
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <label className="text-secondary">{label}</label>
        <span className="text-primary font-medium financial-value">
          {display} {unit}
        </span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
      <p className="text-[10px] text-muted">
        Base actuelle : {formatBase(base)}
      </p>
    </div>
  )
}

function ScenarioBtn({ label, onClick, variant }: {
  label: string
  onClick: () => void
  variant: 'positive' | 'warning' | 'neutral'
}) {
  const cls =
    variant === 'positive' ? 'border-accent/40 text-accent hover:bg-accent/10' :
    variant === 'warning'  ? 'border-warning/40 text-warning hover:bg-warning/10' :
                              'border-border text-secondary hover:bg-surface-2'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs border rounded-md transition-colors ${cls}`}
    >
      {label}
    </button>
  )
}

function Row({ label, tip, base, value, format, higherIsBetter }: {
  label: string
  /** Définition pédagogique (V9.1). */
  tip?: string
  base: number | null
  value: number | null
  format: 'eur' | 'pct' | 'year'
  higherIsBetter: boolean
}) {
  const delta = base != null && value != null ? value - base : null
  const tone =
    delta === null || delta === 0 ? 'neutral' :
    higherIsBetter ? (delta > 0 ? 'positive' : 'negative')
                   : (delta < 0 ? 'positive' : 'negative')

  return (
    <div className="grid grid-cols-12 items-center gap-2">
      <span className="col-span-5 text-secondary text-xs inline-flex items-center gap-1.5">
        {label}
        {tip && <InfoTip text={tip} iconSize={11} />}
      </span>
      <span className="col-span-3 text-right financial-value text-xs text-muted">
        {fmt(base, format)}
      </span>
      <span className={`col-span-3 text-right financial-value text-xs font-medium ${
        tone === 'positive' ? 'text-accent' :
        tone === 'negative' ? 'text-danger'  : 'text-primary'
      }`}>
        {fmt(value, format)}
      </span>
      <span className={`col-span-1 inline-flex items-center justify-end ${
        tone === 'positive' ? 'text-accent' :
        tone === 'negative' ? 'text-danger'  : 'text-muted'
      }`}>
        {delta === null || delta === 0
          ? <Minus size={10} />
          : (higherIsBetter ? (delta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)
                            : (delta < 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />))
        }
      </span>
    </div>
  )
}

function fmt(v: number | null, format: 'eur' | 'pct' | 'year'): string {
  if (v === null) return '—'
  if (format === 'pct') return formatPercent(v)
  if (format === 'year') return v > 0 ? `An ${Math.round(v)}` : 'Jamais'
  return formatCurrency(v, 'EUR')
}
