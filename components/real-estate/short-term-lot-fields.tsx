'use client'

/**
 * Sous-formulaire dedie aux lots en location courte duree (Airbnb / Booking).
 * Inclut :
 *  - Tarification multi-saison + classement Atout France
 *  - Taux d'occupation + duree moyenne de sejour
 *  - Mix plateformes + commissions
 *  - Charges operationnelles a charge proprio
 *  - Calendrier de saisonnalite mensuelle (depliable)
 *  - Bandeau de resultats en temps reel (CA brut / net proprio / occupation)
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Wand2 } from 'lucide-react'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'
import {
  computeShortTermRevenue,
  type ShortTermSeasonalityEntry,
} from '@/lib/real-estate/short-term/revenue'
import type { TourismClassification } from '@/types/database.types'

const MONTHS_FR = [
  'JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN',
  'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC',
] as const

/**
 * Courbe de saisonnalite type "tourisme estival" — appliquee en un clic.
 * Cle = mois (1..12), valeur = { occupancyRatePct }
 */
const DEFAULT_SUMMER_CURVE: Record<number, ShortTermSeasonalityEntry> = {
  1:  { occupancyRatePct: 40 },
  2:  { occupancyRatePct: 40 },
  3:  { occupancyRatePct: 55 },
  4:  { occupancyRatePct: 65 },
  5:  { occupancyRatePct: 75 },
  6:  { occupancyRatePct: 90 },
  7:  { occupancyRatePct: 100 },
  8:  { occupancyRatePct: 100 },
  9:  { occupancyRatePct: 80 },
  10: { occupancyRatePct: 60 },
  11: { occupancyRatePct: 45 },
  12: { occupancyRatePct: 70 },
}

export interface ShortTermLotFieldsValues {
  nightly_rate_low:         number | undefined
  nightly_rate_mid:         number | undefined
  nightly_rate_high:        number | undefined
  occupancy_rate_pct:       number | undefined
  cleaning_fee_per_stay:    number | undefined
  avg_stay_nights:          number | undefined
  platform_airbnb_pct:      number | undefined
  platform_booking_pct:     number | undefined
  platform_airbnb_mix_pct:  number | undefined
  platform_booking_mix_pct: number | undefined
  platform_direct_mix_pct:  number | undefined
  concierge_fee_pct:        number | undefined
  cleaning_cost_per_stay:   number | undefined
  linen_cost_per_stay:      number | undefined
  tourism_classification:   TourismClassification | ''
  seasonality_coefficients: Record<string, ShortTermSeasonalityEntry> | null
}

interface Props {
  values:   ShortTermLotFieldsValues
  setValue: <K extends keyof ShortTermLotFieldsValues>(k: K, v: ShortTermLotFieldsValues[K]) => void
}

export function ShortTermLotFields({ values, setValue }: Props) {
  const [seasonalityOpen, setSeasonalityOpen] = useState(false)

  // Reactif : convertit les seasonality pour le calcul
  const seasonality = useMemo<Record<number, ShortTermSeasonalityEntry> | undefined>(() => {
    const src = values.seasonality_coefficients
    if (!src) return undefined
    const out: Record<number, ShortTermSeasonalityEntry> = {}
    for (const [k, v] of Object.entries(src)) {
      const m = Number(k)
      if (Number.isInteger(m) && m >= 1 && m <= 12 && v) out[m] = v
    }
    return Object.keys(out).length > 0 ? out : undefined
  }, [values.seasonality_coefficients])

  // Calcul reactif des resultats
  const preview = useMemo(() => {
    if (!values.nightly_rate_low) return null
    return computeShortTermRevenue({
      nightlyRateLow:       values.nightly_rate_low,
      nightlyRateMid:       values.nightly_rate_mid,
      nightlyRateHigh:      values.nightly_rate_high,
      occupancyRatePct:     values.occupancy_rate_pct ?? 70,
      avgStayNights:        values.avg_stay_nights    ?? 3,
      seasonality,
      platformAirbnbPct:    values.platform_airbnb_pct  ?? 15,
      platformBookingPct:   values.platform_booking_pct ?? 15,
      platformAirbnbMixPct: values.platform_airbnb_mix_pct  ?? 60,
      platformBookingMixPct:values.platform_booking_mix_pct ?? 30,
      platformDirectMixPct: values.platform_direct_mix_pct  ?? 10,
      cleaningFeePerStay:   values.cleaning_fee_per_stay   ?? 0,
      cleaningCostPerStay:  values.cleaning_cost_per_stay  ?? 0,
      linenCostPerStay:     values.linen_cost_per_stay     ?? 0,
      conciergeFeePct:      values.concierge_fee_pct       ?? 0,
    })
  }, [values, seasonality])

  function updateMonth(month: number, patch: Partial<ShortTermSeasonalityEntry>) {
    const current = values.seasonality_coefficients ?? {}
    const existing = current[String(month)] ?? { occupancyRatePct: values.occupancy_rate_pct ?? 70 }
    const next = { ...current, [String(month)]: { ...existing, ...patch } }
    setValue('seasonality_coefficients', next)
  }

  function applyDefaultCurve() {
    const next: Record<string, ShortTermSeasonalityEntry> = {}
    for (const [m, v] of Object.entries(DEFAULT_SUMMER_CURVE)) {
      next[m] = { ...v }
    }
    setValue('seasonality_coefficients', next)
    setSeasonalityOpen(true)
  }

  const mixTotal =
    (values.platform_airbnb_mix_pct  ?? 0) +
    (values.platform_booking_mix_pct ?? 0) +
    (values.platform_direct_mix_pct  ?? 0)
  const mixError = Math.abs(mixTotal - 100) > 0.1

  // Pic mensuel pour la barre horizontale
  const maxMonthly = preview
    ? Math.max(1, ...preview.monthly.map(m => m.netOwnerRevenue))
    : 1

  return (
    <div className="space-y-5 border-l-2 border-accent/30 pl-4">

      {/* ─── Section 1 — Tarification ─── */}
      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-wider text-muted font-medium">Tarification</h4>
        <FormGrid>
          <Field label="Tarif nuit basse saison (€)" required>
            <Input
              type="number" step={1} min={0}
              value={values.nightly_rate_low ?? ''}
              onChange={(e) => setValue('nightly_rate_low', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="60"
            />
          </Field>
          <Field label="Tarif nuit moyenne saison (€)" hint="Optionnel — auto si vide">
            <Input
              type="number" step={1} min={0}
              value={values.nightly_rate_mid ?? ''}
              onChange={(e) => setValue('nightly_rate_mid', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="80"
            />
          </Field>
          <Field label="Tarif nuit haute saison (€)" hint="Optionnel — auto si vide">
            <Input
              type="number" step={1} min={0}
              value={values.nightly_rate_high ?? ''}
              onChange={(e) => setValue('nightly_rate_high', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="120"
            />
          </Field>
        </FormGrid>

        <FormGrid>
          <Field label="Durée moyenne d'un séjour (nuits)">
            <Input
              type="number" step={0.5} min={1}
              value={values.avg_stay_nights ?? ''}
              onChange={(e) => setValue('avg_stay_nights', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="3"
            />
          </Field>
          <Field label="Frais ménage / séjour (€)" hint="Refacturés au voyageur (revenu)">
            <Input
              type="number" step={1} min={0}
              value={values.cleaning_fee_per_stay ?? ''}
              onChange={(e) => setValue('cleaning_fee_per_stay', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="40"
            />
          </Field>
        </FormGrid>

        <Field
          label="Classement touristique (Atout France)"
          hint="Pilote l'abattement micro-BIC LF 2025 (30/50/71 %)"
        >
          <Select
            value={values.tourism_classification}
            onChange={(e) => setValue('tourism_classification', e.target.value as TourismClassification | '')}
          >
            <option value="">— À sélectionner —</option>
            <option value="non_classe">Non classé (abattement 30 %, plafond 15 000 €)</option>
            <option value="classe_1_2">Classé 1-2 étoiles (50 %, 77 700 €)</option>
            <option value="classe_3_4_5">Classé 3-4-5 étoiles (50 %, 77 700 €)</option>
            <option value="chambre_hotes">Chambre d&apos;hôtes (71 %, 188 700 €)</option>
          </Select>
        </Field>
      </div>

      {/* ─── Section 2 — Occupation ─── */}
      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-wider text-muted font-medium">Occupation</h4>
        <Field label="Taux d'occupation annuel moyen (%)">
          <Input
            type="number" step={1} min={0} max={100}
            value={values.occupancy_rate_pct ?? ''}
            onChange={(e) => setValue('occupancy_rate_pct', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="70"
          />
        </Field>

        <button
          type="button"
          onClick={() => setSeasonalityOpen(o => !o)}
          className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
        >
          {seasonalityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {seasonalityOpen ? 'Masquer la saisonnalité' : 'Configurer la saisonnalité mois par mois'}
        </button>

        {seasonalityOpen && (
          <div className="bg-surface-2 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">
                Personnalisez le taux d&apos;occupation et le tarif nuit par mois.
                Si vide : utilise les valeurs moyennes ci-dessus.
              </p>
              <button
                type="button"
                onClick={applyDefaultCurve}
                className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 px-2 py-1 rounded border border-accent/30"
                title="Applique une courbe été fort / hiver faible"
              >
                <Wand2 size={12} /> Répartition auto
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {MONTHS_FR.map((label, i) => {
                const m = i + 1
                const entry = values.seasonality_coefficients?.[String(m)]
                return (
                  <div key={m} className="space-y-1">
                    <p className="text-[10px] uppercase text-muted text-center">{label}</p>
                    <input
                      type="number"
                      min={0} max={100}
                      placeholder="%"
                      value={entry?.occupancyRatePct ?? ''}
                      onChange={(e) => updateMonth(m, {
                        occupancyRatePct: e.target.value ? Number(e.target.value) : 0,
                      })}
                      className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs text-center"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="€"
                      value={entry?.nightlyRate ?? ''}
                      onChange={(e) => updateMonth(m, {
                        nightlyRate: e.target.value ? Number(e.target.value) : undefined,
                      })}
                      className="w-full bg-surface border border-border rounded px-1.5 py-1 text-[11px] text-center"
                    />
                  </div>
                )
              })}
            </div>

            {preview && (
              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Aperçu — net propriétaire par mois
                </p>
                {preview.monthly.map((mo, i) => (
                  <div key={mo.month} className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted w-6">{MONTHS_FR[i]}</span>
                    <div className="flex-1 h-3 bg-surface rounded overflow-hidden">
                      <div
                        className="h-full bg-accent/70"
                        style={{ width: `${(mo.netOwnerRevenue / maxMonthly) * 100}%` }}
                      />
                    </div>
                    <span className="text-secondary w-16 text-right financial-value">
                      {formatCurrency(Math.round(mo.netOwnerRevenue), 'EUR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Section 3 — Plateformes ─── */}
      <div className="space-y-3">
        <h4 className="text-xs uppercase tracking-wider text-muted font-medium">
          Plateformes et frais
        </h4>
        <p className="text-xs text-muted">
          Distribution des réservations (le total doit faire 100 %)
        </p>
        <FormGrid>
          <Field label="Airbnb — part (%)">
            <Input
              type="number" step={1} min={0} max={100}
              value={values.platform_airbnb_mix_pct ?? ''}
              onChange={(e) => setValue('platform_airbnb_mix_pct', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="60"
            />
          </Field>
          <Field label="Airbnb — commission (%)">
            <Input
              type="number" step={0.1} min={0} max={50}
              value={values.platform_airbnb_pct ?? ''}
              onChange={(e) => setValue('platform_airbnb_pct', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="15"
            />
          </Field>
          <Field label="Booking — part (%)">
            <Input
              type="number" step={1} min={0} max={100}
              value={values.platform_booking_mix_pct ?? ''}
              onChange={(e) => setValue('platform_booking_mix_pct', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="30"
            />
          </Field>
          <Field label="Booking — commission (%)">
            <Input
              type="number" step={0.1} min={0} max={50}
              value={values.platform_booking_pct ?? ''}
              onChange={(e) => setValue('platform_booking_pct', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="15"
            />
          </Field>
          <Field label="Direct — part (%)">
            <Input
              type="number" step={1} min={0} max={100}
              value={values.platform_direct_mix_pct ?? ''}
              onChange={(e) => setValue('platform_direct_mix_pct', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="10"
            />
          </Field>
        </FormGrid>
        {mixError && (
          <p className="text-xs text-warning">
            ⚠ La somme des parts est de {mixTotal.toFixed(0)} % au lieu de 100 %.
          </p>
        )}

        <p className="text-xs text-muted pt-2">Frais à charge du propriétaire</p>
        <FormGrid>
          <Field label="Ménage / séjour (€)">
            <Input
              type="number" step={1} min={0}
              value={values.cleaning_cost_per_stay ?? ''}
              onChange={(e) => setValue('cleaning_cost_per_stay', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="50"
            />
          </Field>
          <Field label="Linge / séjour (€)">
            <Input
              type="number" step={1} min={0}
              value={values.linen_cost_per_stay ?? ''}
              onChange={(e) => setValue('linen_cost_per_stay', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="15"
            />
          </Field>
          <Field label="Conciergerie (% du CA net)">
            <Input
              type="number" step={0.5} min={0} max={50}
              value={values.concierge_fee_pct ?? ''}
              onChange={(e) => setValue('concierge_fee_pct', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="20"
            />
          </Field>
        </FormGrid>
      </div>

      {/* ─── Bandeau resultats ─── */}
      {preview && (
        <div className="bg-accent-muted border border-accent/20 rounded-lg p-3 space-y-1 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted">Estimation annuelle</p>
          <Row label="CA brut" value={preview.grossRevenueTotal} />
          <Row label="Commissions plateformes" value={-preview.platformCommissionTotal} muted />
          <Row label="Frais opérationnels" value={-preview.operationalCostsTotal} muted />
          <div className="border-t border-border my-1" />
          <Row label="Revenu net propriétaire" value={preview.netOwnerRevenueTotal} highlight />
          <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
            <Stat label="Taux d'occupation" value={`${preview.annualOccupancyPct.toFixed(0)} %`} />
            <Stat label="RevPAN" value={`${preview.revenuePerAvailableNight.toFixed(0)} €/nuit`} />
            <Stat label="Séjours / an" value={`${preview.totalNbStays}`} />
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, muted, highlight }: {
  label: string
  value: number
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-muted' : 'text-secondary'}>{label}</span>
      <span className={`financial-value ${highlight ? 'text-accent font-medium' : 'text-primary'}`}>
        {formatCurrency(Math.round(value), 'EUR')} / an
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-[10px] uppercase">{label}</p>
      <p className="text-primary font-medium financial-value">{value}</p>
    </div>
  )
}
