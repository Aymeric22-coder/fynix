'use client'

import { useState, useMemo, useCallback, useTransition } from 'react'
import {
  Save, RotateCcw, AlertTriangle, ChevronDown, ChevronUp,
  Download, TrendingUp, Banknote, Clock, Calculator,
} from 'lucide-react'
import { buildSimulationInputFromDb, runSimulation } from '@/lib/real-estate'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from '@/lib/real-estate/build-from-db'
import type { SimulationResult } from '@/lib/real-estate'
import { Field, Input, Select } from '@/components/ui/field'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import {
  CapitalVsValueChart,
  AnnualCashFlowChart,
  CumulativeCashFlowChart,
} from './simulation-charts'

// ─── Types ─────────────────────────────────────────────────────────────────

interface SimParams {
  fiscalRegime:              string
  tmiPct:                    number
  acquisitionFeesTreatment:  'expense_y1' | 'amortized'
  monthlyRentOverride:       string   // '' = utiliser lots, sinon valeur numérique
  vacancyMonths:             number
  rentalIndexPct:            number
  chargesIndexPct:           number
  propertyIndexPct:          number
  downPayment:               number
  horizonYears:              number
  landSharePct:              number
  amortBuildingYears:        number
  amortWorksYears:           number
  amortFurnitureYears:       number
  furnitureAmount:           number
  lmpSsiRate:                number
  lmnpMicroAbattementPct:    number
  gliPct:                    number
  managementPct:             number
}

interface Props {
  propertyId: string
  property:   DbProperty
  asset:      DbAsset | null
  lots:       DbLot[]
  charges:    DbCharges | null
  debt:       DbDebt | null
  profile:    DbProfile | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined, fallback = 0): number {
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function computeDownPayment(property: DbProperty, debt: DbDebt | null): number {
  const acq = (property.purchase_price ?? 0) + (property.purchase_fees ?? 0) + (property.works_amount ?? 0)
  const borrowed = debt?.initial_amount ?? 0
  return Math.max(0, acq - borrowed)
}

function computeHorizon(debt: DbDebt | null): number {
  if (debt?.duration_months) return Math.max(25, Math.ceil(debt.duration_months / 12))
  return 25
}

function paramsFromDb(property: DbProperty, debt: DbDebt | null): SimParams {
  return {
    fiscalRegime:             property.fiscal_regime ?? 'foncier_nu',
    tmiPct:                   30,  // sera surchargé par le profile
    acquisitionFeesTreatment: (property.acquisition_fees_treatment ?? 'expense_y1') as 'expense_y1' | 'amortized',
    monthlyRentOverride:      property.assumed_total_rent != null ? String(property.assumed_total_rent) : '',
    vacancyMonths:            property.vacancy_months    ?? 0,
    rentalIndexPct:           property.rental_index_pct  ?? 2.0,
    chargesIndexPct:          property.charges_index_pct ?? 2.0,
    propertyIndexPct:         property.property_index_pct ?? 1.0,
    downPayment:              computeDownPayment(property, debt),
    horizonYears:             computeHorizon(debt),
    landSharePct:             property.land_share_pct        ?? 15,
    amortBuildingYears:       property.amort_building_years  ?? 30,
    amortWorksYears:          property.amort_works_years     ?? 15,
    amortFurnitureYears:      property.amort_furniture_years ?? 7,
    furnitureAmount:          property.furniture_amount      ?? 0,
    lmpSsiRate:               property.lmp_ssi_rate          ?? 35,
    lmnpMicroAbattementPct:   property.lmnp_micro_abattement_pct ?? 50,
    gliPct:                   property.gli_pct               ?? 0,
    managementPct:            property.management_pct        ?? 0,
  }
}

function paramsWithProfile(base: SimParams, profile: DbProfile | null): SimParams {
  return { ...base, tmiPct: profile?.tmi_rate ?? 30 }
}

const FISCAL_REGIMES = [
  { value: 'foncier_nu',    label: 'Foncier réel' },
  { value: 'foncier_micro', label: 'Micro-foncier (30 %)' },
  { value: 'lmnp_reel',     label: 'LMNP réel' },
  { value: 'lmnp_micro',    label: 'LMNP micro-BIC' },
  { value: 'lmp',           label: 'LMP' },
  { value: 'sci_is',        label: 'SCI à l\'IS' },
  { value: 'sci_ir',        label: 'SCI à l\'IR' },
]

const REAL_REGIMES = new Set(['foncier_nu', 'lmnp_reel', 'lmp', 'sci_is'])
const IR_REGIMES   = new Set(['foncier_nu', 'foncier_micro', 'lmnp_reel', 'lmnp_micro', 'lmp', 'sci_ir'])

// ─── CSV export ────────────────────────────────────────────────────────────

function exportCsv(result: SimulationResult) {
  const headers = [
    'Année','Loyer brut','Vacance','Loyer net','Charges','Intérêts',
    'Amort. capital','Assurance emprunt','Impôts','Cash-flow net','Cash-flow cumulé',
    'Valeur bien','Capital restant','Valeur nette',
  ]
  const rows = result.projection.map((y) => [
    y.year,
    y.grossRent.toFixed(2),
    y.vacancy.toFixed(2),
    y.netRent.toFixed(2),
    y.charges.toFixed(2),
    y.interest.toFixed(2),
    y.principalRepaid.toFixed(2),
    y.insurance.toFixed(2),
    y.taxPaid.toFixed(2),
    y.cashFlowAfterTax.toFixed(2),
    y.cumulativeCashFlow.toFixed(2),
    y.estimatedValue.toFixed(2),
    (y.remainingCapital ?? 0).toFixed(2),
    y.netPropertyValue.toFixed(2),
  ])
  const csv = [headers, ...rows].map((r) => r.join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'simulation.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Composant principal ───────────────────────────────────────────────────

export function SimulationPanel({ propertyId, property, asset, lots, charges, debt, profile }: Props) {
  const initial = useMemo(() => paramsWithProfile(paramsFromDb(property, debt), profile), [property, debt, profile])
  const [params, setParams] = useState<SimParams>(initial)
  const [showTable, setShowTable] = useState(false)
  const [saving, startSave] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  const isDirty = useMemo(() => JSON.stringify(params) !== JSON.stringify(initial), [params, initial])

  // ── Simulation (100 % client, pas d'appel réseau) ───────────────────────
  const result = useMemo<SimulationResult>(() => {
    const dbProp: DbProperty = {
      ...property,
      fiscal_regime:                params.fiscalRegime,
      assumed_total_rent:           params.monthlyRentOverride !== '' ? toNum(params.monthlyRentOverride) : null,
      vacancy_months:               params.vacancyMonths,
      rental_index_pct:             params.rentalIndexPct,
      charges_index_pct:            params.chargesIndexPct,
      property_index_pct:           params.propertyIndexPct,
      land_share_pct:               params.landSharePct,
      amort_building_years:         params.amortBuildingYears,
      amort_works_years:            params.amortWorksYears,
      amort_furniture_years:        params.amortFurnitureYears,
      furniture_amount:             params.furnitureAmount,
      lmp_ssi_rate:                 params.lmpSsiRate,
      lmnp_micro_abattement_pct:    params.lmnpMicroAbattementPct,
      gli_pct:                      params.gliPct,
      management_pct:               params.managementPct,
      acquisition_fees_treatment:   params.acquisitionFeesTreatment,
    }
    const dbProfile: DbProfile = { tmi_rate: params.tmiPct }

    const input = buildSimulationInputFromDb(
      dbProp, asset, lots, charges, debt, dbProfile,
      { downPayment: params.downPayment, horizonYears: params.horizonYears },
    )
    return runSimulation(input)
  }, [params, property, asset, lots, charges, debt])

  // ── Mise à jour d'un champ ───────────────────────────────────────────────
  const set = useCallback(<K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    setParams((p) => ({ ...p, [key]: value }))
    setSaveError(null)
    setSavedOk(false)
  }, [])

  const reset = useCallback(() => {
    setParams(initial)
    setSaveError(null)
    setSavedOk(false)
  }, [initial])

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const save = useCallback(() => {
    startSave(async () => {
      setSaveError(null)
      setSavedOk(false)
      try {
        const propertyBody = {
          fiscal_regime:                params.fiscalRegime,
          assumed_total_rent:           params.monthlyRentOverride !== '' ? toNum(params.monthlyRentOverride) : null,
          vacancy_months:               params.vacancyMonths,
          rental_index_pct:             params.rentalIndexPct,
          charges_index_pct:            params.chargesIndexPct,
          property_index_pct:           params.propertyIndexPct,
          land_share_pct:               params.landSharePct,
          amort_building_years:         params.amortBuildingYears,
          amort_works_years:            params.amortWorksYears,
          amort_furniture_years:        params.amortFurnitureYears,
          furniture_amount:             params.furnitureAmount,
          lmp_ssi_rate:                 params.lmpSsiRate,
          lmnp_micro_abattement_pct:    params.lmnpMicroAbattementPct,
          gli_pct:                      params.gliPct,
          management_pct:               params.managementPct,
          acquisition_fees_treatment:   params.acquisitionFeesTreatment,
        }
        const res = await fetch(`/api/real-estate/${propertyId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(propertyBody),
        })
        if (!res.ok) throw new Error('Erreur lors de la sauvegarde du bien')
        setSavedOk(true)
        setTimeout(() => setSavedOk(false), 3000)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    })
  }, [params, propertyId])

  const { kpis, projection, incompleteData, missingFields } = result

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* En-tête section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-primary">Simulation & Projection</h2>
          {isDirty && (
            <span className="text-xs bg-warning/10 text-warning border border-warning/20 rounded-full px-2.5 py-0.5">
              Modifications non enregistrées
            </span>
          )}
          {savedOk && (
            <span className="text-xs bg-accent/10 text-accent border border-accent/20 rounded-full px-2.5 py-0.5">
              Enregistré
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-accent/30"
            >
              <RotateCcw size={12} />
              Réinitialiser
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !isDirty}
            className="flex items-center gap-1.5 text-xs bg-accent text-white rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={12} />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      {/* Données incomplètes */}
      {incompleteData && (
        <div className="flex items-start gap-3 bg-warning/5 border border-warning/20 rounded-xl p-4">
          <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-warning">Données incomplètes</p>
            <p className="text-xs text-secondary mt-1">
              La simulation ne peut pas s&apos;afficher car certains champs sont manquants :
              {' '}<span className="font-mono text-muted">{missingFields?.join(', ')}</span>.
              Complétez le crédit ou les paramètres du bien pour obtenir la projection.
            </p>
          </div>
        </div>
      )}

      {/* Grid : Paramètres | Résultats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Panneau paramètres (1/3) ─────────────────────────────── */}
        <div className="card p-5 space-y-5">
          <p className="text-xs text-secondary uppercase tracking-widest font-medium">Paramètres</p>

          {/* Régime & TMI */}
          <div className="space-y-3">
            <Field label="Régime fiscal">
              <Select
                value={params.fiscalRegime}
                onChange={(e) => set('fiscalRegime', e.target.value)}
              >
                {FISCAL_REGIMES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>

            {IR_REGIMES.has(params.fiscalRegime) && (
              <Field label="TMI (%)">
                <Select
                  value={params.tmiPct}
                  onChange={(e) => set('tmiPct', Number(e.target.value))}
                >
                  {[0, 11, 30, 41, 45].map((t) => (
                    <option key={t} value={t}>{t} %</option>
                  ))}
                </Select>
              </Field>
            )}

            {REAL_REGIMES.has(params.fiscalRegime) && (
              <Field label="Frais d'acquisition">
                <Select
                  value={params.acquisitionFeesTreatment}
                  onChange={(e) => set('acquisitionFeesTreatment', e.target.value as 'expense_y1' | 'amortized')}
                >
                  <option value="expense_y1">Charge en année 1</option>
                  <option value="amortized">Amortis sur la durée</option>
                </Select>
              </Field>
            )}

            {params.fiscalRegime === 'lmp' && (
              <Field label="Taux SSI (%)">
                <Input
                  type="number" min={0} max={60} step={0.5}
                  value={params.lmpSsiRate}
                  onChange={(e) => set('lmpSsiRate', toNum(e.target.value, 35))}
                />
              </Field>
            )}

            {params.fiscalRegime === 'lmnp_micro' && (
              <Field label="Abattement micro-BIC">
                <Select
                  value={params.lmnpMicroAbattementPct}
                  onChange={(e) => set('lmnpMicroAbattementPct', Number(e.target.value))}
                >
                  <option value={50}>50 % (standard)</option>
                  <option value={71}>71 % (meublé tourisme classé)</option>
                </Select>
              </Field>
            )}
          </div>

          {/* Loyers & vacance */}
          <div className="space-y-3 pt-3 border-t border-border">
            <p className="text-xs text-muted uppercase tracking-wide">Loyers</p>

            <Field label="Loyer mensuel (€)" hint="Vide = somme des lots">
              <Input
                type="number" min={0} step={10}
                placeholder={String(lots.reduce((s, l) => s + (l.rent_amount ?? 0), 0))}
                value={params.monthlyRentOverride}
                onChange={(e) => set('monthlyRentOverride', e.target.value)}
              />
            </Field>

            <Field label="Vacance (mois/an)">
              <Input
                type="number" min={0} max={12} step={0.5}
                value={params.vacancyMonths}
                onChange={(e) => set('vacancyMonths', toNum(e.target.value))}
              />
            </Field>

            <Field label="Indexation loyers (%/an)">
              <Input
                type="number" min={0} max={10} step={0.1}
                value={params.rentalIndexPct}
                onChange={(e) => set('rentalIndexPct', toNum(e.target.value, 2))}
              />
            </Field>

            <Field label="Frais de gestion (%)">
              <Input
                type="number" min={0} max={20} step={0.5}
                value={params.managementPct}
                onChange={(e) => set('managementPct', toNum(e.target.value))}
              />
            </Field>
          </div>

          {/* Financier */}
          <div className="space-y-3 pt-3 border-t border-border">
            <p className="text-xs text-muted uppercase tracking-wide">Hypothèses</p>

            <Field label="Apport personnel (€)">
              <Input
                type="number" min={0} step={1000}
                value={params.downPayment}
                onChange={(e) => set('downPayment', toNum(e.target.value))}
              />
            </Field>

            <Field label="Horizon (ans)">
              <Input
                type="number" min={1} max={50}
                value={params.horizonYears}
                onChange={(e) => set('horizonYears', Math.max(1, toNum(e.target.value, 25)))}
              />
            </Field>

            <Field label="Indexation bien (%/an)">
              <Input
                type="number" min={-5} max={10} step={0.1}
                value={params.propertyIndexPct}
                onChange={(e) => set('propertyIndexPct', toNum(e.target.value, 1))}
              />
            </Field>

            <Field label="Indexation charges (%/an)">
              <Input
                type="number" min={0} max={10} step={0.1}
                value={params.chargesIndexPct}
                onChange={(e) => set('chargesIndexPct', toNum(e.target.value, 2))}
              />
            </Field>
          </div>

          {/* Avancé — régimes réels */}
          {REAL_REGIMES.has(params.fiscalRegime) && (
            <div className="space-y-3 pt-3 border-t border-border">
              <p className="text-xs text-muted uppercase tracking-wide">Amortissement</p>

              <Field label="Part terrain (%)">
                <Input
                  type="number" min={0} max={50} step={1}
                  value={params.landSharePct}
                  onChange={(e) => set('landSharePct', toNum(e.target.value, 15))}
                />
              </Field>

              <Field label="Durée amort. bâti (ans)">
                <Input
                  type="number" min={10} max={50}
                  value={params.amortBuildingYears}
                  onChange={(e) => set('amortBuildingYears', toNum(e.target.value, 30))}
                />
              </Field>

              {(property.works_amount ?? 0) > 0 && (
                <Field label="Durée amort. travaux (ans)">
                  <Input
                    type="number" min={5} max={30}
                    value={params.amortWorksYears}
                    onChange={(e) => set('amortWorksYears', toNum(e.target.value, 15))}
                  />
                </Field>
              )}

              <Field label="Mobilier (€)" hint="LMNP/LMP — amortissable">
                <Input
                  type="number" min={0} step={500}
                  value={params.furnitureAmount}
                  onChange={(e) => set('furnitureAmount', toNum(e.target.value))}
                />
              </Field>

              {params.furnitureAmount > 0 && (
                <Field label="Durée amort. mobilier (ans)">
                  <Input
                    type="number" min={3} max={15}
                    value={params.amortFurnitureYears}
                    onChange={(e) => set('amortFurnitureYears', toNum(e.target.value, 7))}
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        {/* ── Résultats (2/3) ──────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                icon: Banknote,
                label: 'Cash-flow mensuel',
                value: incompleteData ? '—' : formatCurrency(kpis.monthlyCashFlowYear1, 'EUR'),
                sub: 'Année 1 après impôts',
                accent: !incompleteData && kpis.monthlyCashFlowYear1 >= 0,
              },
              {
                icon: TrendingUp,
                label: 'Rendement net-net',
                value: incompleteData ? '—' : (kpis.netNetYield > 0 ? formatPercent(kpis.netNetYield) : '—'),
                sub: `Brut : ${kpis.grossYieldOnPrice > 0 ? formatPercent(kpis.grossYieldOnPrice) : '—'}`,
              },
              {
                icon: Clock,
                label: 'Remboursement',
                value: incompleteData || kpis.paybackYear === null ? '—' : `Année ${kpis.paybackYear}`,
                sub: 'Cash-flow cumulé ≥ 0',
              },
              {
                icon: Calculator,
                label: 'Coût total opération',
                value: incompleteData ? '—' : formatCurrency(kpis.totalCost, 'EUR', { compact: true }),
                sub: `Dont ${formatCurrency(kpis.monthlyPayment * 12, 'EUR', { compact: true })} /an crédit`,
              },
            ].map((k) => (
              <div key={k.label} className={`card p-4 space-y-2 ${k.accent ? 'border-accent/30' : ''}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-secondary uppercase tracking-wider">{k.label}</p>
                  <k.icon size={13} className="text-muted" />
                </div>
                <p className={`text-lg font-semibold financial-value ${k.accent ? 'text-accent' : 'text-primary'}`}>
                  {k.value}
                </p>
                <p className="text-xs text-muted">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Graphiques — masqués si données incomplètes */}
          {!incompleteData && projection.length > 0 && (
            <>
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest mb-4">
                  Valeur bien · Capital restant dû · Valeur nette
                </p>
                <CapitalVsValueChart projection={projection} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card p-5">
                  <p className="text-xs text-secondary uppercase tracking-widest mb-4">Cash-flow annuel net</p>
                  <AnnualCashFlowChart projection={projection} />
                </div>
                <div className="card p-5">
                  <p className="text-xs text-secondary uppercase tracking-widest mb-4">Cash-flow cumulé</p>
                  <CumulativeCashFlowChart projection={projection} />
                </div>
              </div>

              {/* Tableau annuel */}
              <div className="card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-2 transition-colors"
                  onClick={() => setShowTable((v) => !v)}
                >
                  <p className="text-xs text-secondary uppercase tracking-widest font-medium">
                    Tableau annuel ({projection.length} ans)
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); exportCsv(result) }}
                      className="flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
                      title="Exporter en CSV"
                    >
                      <Download size={12} />
                      CSV
                    </button>
                    {showTable ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                  </div>
                </button>

                {showTable && (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted uppercase tracking-wider bg-surface-2">
                          {['An','Loyer brut','Vacance','Charges','Crédit','Impôts','CF net','CF cumulé','Valeur nette'].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-right first:text-left whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {projection.map((y) => (
                          <tr key={y.year} className="hover:bg-surface-2 transition-colors">
                            <td className="px-3 py-2 text-secondary">{y.year}</td>
                            <td className="px-3 py-2 text-right financial-value">{formatCurrency(y.grossRent, 'EUR', { compact: true })}</td>
                            <td className="px-3 py-2 text-right text-danger financial-value">{y.vacancy > 0 ? `-${formatCurrency(y.vacancy, 'EUR', { compact: true })}` : '—'}</td>
                            <td className="px-3 py-2 text-right text-danger financial-value">{formatCurrency(y.charges, 'EUR', { compact: true })}</td>
                            <td className="px-3 py-2 text-right text-danger financial-value">{y.interest > 0 ? formatCurrency(y.interest + y.principalRepaid + y.insurance, 'EUR', { compact: true }) : '—'}</td>
                            <td className="px-3 py-2 text-right financial-value">{y.taxPaid !== 0 ? formatCurrency(y.taxPaid, 'EUR', { compact: true }) : '—'}</td>
                            <td className={`px-3 py-2 text-right font-medium financial-value ${y.cashFlowAfterTax >= 0 ? 'text-accent' : 'text-danger'}`}>
                              {formatCurrency(y.cashFlowAfterTax, 'EUR', { compact: true })}
                            </td>
                            <td className={`px-3 py-2 text-right font-medium financial-value ${y.cumulativeCashFlow >= 0 ? 'text-accent' : 'text-secondary'}`}>
                              {formatCurrency(y.cumulativeCashFlow, 'EUR', { compact: true })}
                            </td>
                            <td className="px-3 py-2 text-right financial-value text-primary">{formatCurrency(y.netPropertyValue, 'EUR', { compact: true })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
