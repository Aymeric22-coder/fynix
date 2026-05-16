/**
 * Section "Projection FIRE interactive" Phase 9 — version refondue :
 *
 *   1. Graphique stacked area (4 composantes : financier, immo existant,
 *      immo futur, cash)
 *   2. 5 cartes résumé (indépendance, patrimoine âge cible, revenu
 *      passif, effort mensuel, levier immobilier)
 *   3. 5 sliders (épargne DCA, rendement financier, revenu cible,
 *      appréciation immo, inflation loyers)
 *   4. Simulateur d'acquisitions futures (jusqu'à 5)
 *
 * Toute la logique métier vient de `lib/analyse/projectionFIRE.ts`.
 * Recalcul instantané (< 100 ms) via useMemo à chaque changement.
 */
'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Plus, Sparkles, Target, TrendingUp, Wallet, Building2 } from 'lucide-react'
import { projectionGlobale, calculerImpactAcquisition, calculerRendementPortefeuille } from '@/lib/analyse/projectionFIRE'
import { formatCurrency } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { AcquisitionFutureForm } from './AcquisitionFutureForm'
import type { PatrimoineComplet, AcquisitionFuture } from '@/types/analyse'

interface Props {
  patrimoine: PatrimoineComplet
}

const COLOR_FIN  = '#10b981'   // emerald
const COLOR_IMMO = '#E8B84B'   // or
const COLOR_ACQ  = '#3b82f6'   // bleu
const COLOR_CASH = '#71717a'   // muted

let uid = 0
const newId = () => `acq_${Date.now()}_${++uid}`

function defaultAcquisition(): AcquisitionFuture {
  return {
    id: newId(),
    nom: 'Nouvelle acquisition',
    dans_combien_annees: 3,
    prix_achat: 180000, frais_notaire_pct: 8, apport: 36000,
    taux_interet: 3.5, duree_credit_ans: 20,
    type: 'locatif', loyer_brut_mensuel: 900, taux_vacance_pct: 5,
    charges_mensuelles: 100, appreciation_annuelle_pct: 2,
  }
}

export function ProjectionFIRE({ patrimoine }: Props) {
  const fi = patrimoine.fireInputs

  // Cas profil incomplet
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

  // ── État local sliders ──────────────────────────────────────────
  const rendementDefaut = Math.max(3, Math.min(12, calculerRendementPortefeuille(patrimoine) || 7))
  const [epargne,           setEpargne]           = useState<number>(fi.epargne_mensuelle)
  const [rendement,         setRendement]         = useState<number>(rendementDefaut)
  const [revenuCible,       setRevenuCible]       = useState<number>(fi.revenu_passif_cible)
  const [appreciationImmo,  setAppreciationImmo]  = useState<number>(2)
  const [inflationLoyers,   setInflationLoyers]   = useState<number>(1.5)

  const [acquisitions, setAcquisitions] = useState<AcquisitionFuture[]>([])

  // ── Projection globale ─────────────────────────────────────────
  const result = useMemo(() => projectionGlobale({
    ageActuel:                 fi.age!,
    ageCible:                  fi.age_cible!,
    revenuPassifCible:         revenuCible,
    epargneMensuelle:          epargne,
    rendementCentral:          rendement,
    appreciationImmoPct:       appreciationImmo,
    inflationLoyersPct:        inflationLoyers,
    patrimoineFinancierActuel: patrimoine.totalPortefeuille,
    cashActuel:                patrimoine.totalCash,
    biensExistants:            patrimoine.biens,
    acquisitionsFutures:       acquisitions,
  }), [
    fi.age, fi.age_cible, revenuCible, epargne, rendement,
    appreciationImmo, inflationLoyers, patrimoine, acquisitions,
  ])

  const ageIndepText = result.ageIndependanceCentral !== null
    ? `${result.ageIndependanceCentral} ans`
    : 'Hors horizon'
  const ecartText = result.ecartObjectif === null
    ? '—'
    : result.ecartObjectif <= 0
    ? `${-result.ecartObjectif} an${-result.ecartObjectif > 1 ? 's' : ''} d'avance`
    : `${result.ecartObjectif} an${result.ecartObjectif > 1 ? 's' : ''} de retard`
  const onTime = result.ageIndependanceCentral !== null && result.ageIndependanceCentral <= fi.age_cible

  return (
    <div className="card p-5">
      <div className="mb-4">
        <p className="text-xs text-secondary uppercase tracking-widest">Projection FIRE</p>
        <p className="text-xs text-muted mt-0.5">4 composantes — financier, immo existant, acquisitions futures, cash</p>
      </div>

      {/* ─── 5 cartes résumé ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <SummaryCard
          icon={<Sparkles size={12} className="text-accent" />}
          label="Indépendance"
          value={ageIndepText}
          sub={ecartText}
          accent={onTime ? 'success' : 'warning'}
        />
        <SummaryCard
          icon={<Wallet size={12} className="text-accent" />}
          label={`Patrimoine à ${fi.age_cible} ans`}
          value={formatCurrency(result.patrimoineAgeCible, 'EUR', { compact: true })}
          sub={`fin ${formatCurrency(result.detailsAgeCible.financier, 'EUR', { compact: true })} · immo ${formatCurrency(result.detailsAgeCible.equityImmoExistant + result.detailsAgeCible.equityImmoFuture, 'EUR', { compact: true })}`}
        />
        <SummaryCard
          icon={<Target size={12} className="text-accent" />}
          label="Revenu passif"
          value={formatCurrency(
            result.detailsAgeCible.loyersNetsMensuels + result.detailsAgeCible.financier * 0.04 / 12,
            'EUR', { decimals: 0 },
          ) + '/m'}
          sub={`cible ${formatCurrency(revenuCible, 'EUR', { decimals: 0 })}/m`}
          accent={result.detailsAgeCible.loyersNetsMensuels + result.detailsAgeCible.financier * 0.04 / 12 >= revenuCible ? 'success' : 'warning'}
        />
        <SummaryCard
          icon={<TrendingUp size={12} className="text-secondary" />}
          label="Effort mensuel"
          value={formatCurrency(epargne + patrimoine.mensualitesImmoTotal, 'EUR', { decimals: 0 }) + '/m'}
          sub={`DCA ${formatCurrency(epargne, 'EUR', { decimals: 0 })} + immo ${formatCurrency(patrimoine.mensualitesImmoTotal, 'EUR', { decimals: 0 })}`}
        />
        <SummaryCard
          icon={<Building2 size={12} className="text-amber-400" />}
          label="Levier immo"
          value={formatCurrency(result.detailsAgeCible.valeurBruteImmo, 'EUR', { compact: true })}
          sub={`equity ${formatCurrency(result.detailsAgeCible.equityImmoExistant + result.detailsAgeCible.equityImmoFuture, 'EUR', { compact: true })}`}
        />
      </div>

      {/* ─── Graphique stacked area ─── */}
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={result.points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gFin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_FIN} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COLOR_FIN} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gImmo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_IMMO} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COLOR_IMMO} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gAcq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_ACQ} stopOpacity={0.6} />
                <stop offset="100%" stopColor={COLOR_ACQ} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_CASH} stopOpacity={0.5} />
                <stop offset="100%" stopColor={COLOR_CASH} stopOpacity={0.05} />
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
              itemStyle={{ color: '#f4f4f5' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
            <Area type="monotone" stackId="1" dataKey="patrimoineFinancier" name="Financier"        stroke={COLOR_FIN}  fill="url(#gFin)"  strokeWidth={1.5} />
            <Area type="monotone" stackId="1" dataKey="equityImmoExistant"  name="Immo existant"    stroke={COLOR_IMMO} fill="url(#gImmo)" strokeWidth={1.5} />
            <Area type="monotone" stackId="1" dataKey="equityImmoFuture"    name="Acquisitions"     stroke={COLOR_ACQ}  fill="url(#gAcq)"  strokeWidth={1.5} />
            <Area type="monotone" stackId="1" dataKey="cash"                name="Cash"             stroke={COLOR_CASH} fill="url(#gCash)" strokeWidth={1.5} />
            <ReferenceLine x={fi.age_cible} stroke="#71717a" strokeDasharray="3 3" label={{ value: 'Âge cible', fill: '#71717a', fontSize: 11, position: 'top' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ─── Warnings éventuels ─── */}
      {result.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-warning bg-warning-muted border border-warning/30 rounded-lg px-3 py-1.5">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* ─── 5 sliders ─── */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Slider label="Épargne mensuelle DCA"  value={epargne}          min={0}    max={5000}  step={50}
                format={(v) => formatCurrency(v, 'EUR', { decimals: 0 })} onChange={setEpargne} />
        <Slider label="Rendement marchés"      value={rendement}        min={3}    max={12}    step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setRendement} />
        <Slider label="Revenu passif cible"    value={revenuCible}      min={1000} max={10000} step={100}
                format={(v) => `${formatCurrency(v, 'EUR', { decimals: 0 })}/m`} onChange={setRevenuCible} />
        <Slider label="Appréciation immo"      value={appreciationImmo} min={0}    max={5}     step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setAppreciationImmo} />
        <Slider label="Inflation loyers"       value={inflationLoyers}  min={0}    max={4}     step={0.5}
                format={(v) => `${v.toFixed(1)} %`} onChange={setInflationLoyers} />
      </div>

      {/* ─── Simulateur acquisitions futures ─── */}
      <div className="mt-6 pt-5 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-secondary uppercase tracking-widest">Acquisitions futures simulées</p>
            <p className="text-xs text-muted mt-0.5">Stockage local — non sauvegardé</p>
          </div>
          {acquisitions.length < 5 && (
            <Button variant="secondary" icon={Plus}
              onClick={() => setAcquisitions((prev) => [...prev, defaultAcquisition()])}>
              Ajouter
            </Button>
          )}
        </div>

        {acquisitions.length === 0 ? (
          <p className="text-xs text-muted">Aucune acquisition simulée. Ajoutez-en pour voir l&apos;impact sur votre courbe FIRE.</p>
        ) : (
          <div className="space-y-4">
            {acquisitions.map((a) => (
              <AcquisitionWithImpact
                key={a.id}
                acquisition={a}
                baseInputs={{
                  ageActuel:                 fi.age!,
                  ageCible:                  fi.age_cible!,
                  revenuPassifCible:         revenuCible,
                  epargneMensuelle:          epargne,
                  rendementCentral:          rendement,
                  appreciationImmoPct:       appreciationImmo,
                  inflationLoyersPct:        inflationLoyers,
                  patrimoineFinancierActuel: patrimoine.totalPortefeuille,
                  cashActuel:                patrimoine.totalCash,
                  biensExistants:            patrimoine.biens,
                  acquisitionsFutures:       acquisitions,
                }}
                onChange={(updated) => setAcquisitions((prev) =>
                  prev.map((x) => x.id === updated.id ? updated : x))}
                onDelete={() => setAcquisitions((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Disclaimer ─── */}
      <p className="mt-4 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
        ⚠ Simulation indicative basée sur des hypothèses de rendement et d&apos;appréciation
        (rendement marchés {rendement.toFixed(1)} %/an, appréciation immo {appreciationImmo.toFixed(1)} %/an,
        inflation loyers {inflationLoyers.toFixed(1)} %/an). Les performances passées ne préjugent pas
        des performances futures.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  accent?: 'success' | 'warning'
}) {
  const color = accent === 'success' ? 'text-accent' : accent === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest">
        {icon}<span className="truncate">{label}</span>
      </div>
      <p className={`text-base font-semibold financial-value mt-1.5 ${color}`}>{value}</p>
      <p className="text-[10px] text-muted truncate">{sub}</p>
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

/**
 * Bloc "AcquisitionFutureForm + badge impact FIRE".
 * Calcule en mémo l'impact (delta années) de l'acquisition sur l'âge FIRE.
 */
function AcquisitionWithImpact({
  acquisition, baseInputs, onChange, onDelete,
}: {
  acquisition: AcquisitionFuture
  baseInputs:  Parameters<typeof projectionGlobale>[0]
  onChange:    (a: AcquisitionFuture) => void
  onDelete:    () => void
}) {
  const impact = useMemo(() => calculerImpactAcquisition(baseInputs, acquisition), [baseInputs, acquisition])
  return (
    <div>
      <AcquisitionFutureForm acquisition={acquisition} onChange={onChange} onDelete={onDelete} />
      {impact !== 0 && (
        <p className={`text-xs mt-1.5 ${impact > 0 ? 'text-accent' : 'text-warning'}`}>
          Impact FIRE : {impact > 0 ? `+${impact} an${impact > 1 ? 's' : ''} d'avance` : `${impact} an${impact < -1 ? 's' : ''} de retard`}
        </p>
      )}
    </div>
  )
}
