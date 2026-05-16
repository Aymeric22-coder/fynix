/**
 * Sous-onglet Portefeuille > Immo papier (SCPI / REIT cotés).
 *
 * Rendement vs marché SCPI + géo + note liquidité.
 */
'use client'

import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { geoZone } from '@/lib/analyse/geoMapping'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

const RENDEMENT_MARCHE_SCPI_2024 = 4.5  // % référence marché français

export function ImmoPapierAnalyse({ data }: Props) {
  const scpis = useMemo(
    () => data.positions.filter((p) => p.asset_type === 'scpi'),
    [data.positions],
  )

  // Rendement net moyen pondéré (estimation : on n'a pas le TD réel, on
  // utilise 5 % par défaut — référence marché).
  const totalValue = scpis.reduce((s, p) => s + p.current_value, 0)
  const rendementMoyen = 5  // hypothèse — pourrait venir d'isin_cache.metadata.td

  // Répartition géo (France / Europe / International)
  const partFrance = scpis.filter((p) => p.country === 'France')
    .reduce((s, p) => s + p.current_value, 0)
  const partEurope = scpis.filter((p) => p.country && geoZone(p.country) === 'Europe' && p.country !== 'France')
    .reduce((s, p) => s + p.current_value, 0)
  const partInter  = totalValue - partFrance - partEurope
  const pctFrance  = totalValue > 0 ? (partFrance / totalValue) * 100 : 0
  const pctEurope  = totalValue > 0 ? (partEurope / totalValue) * 100 : 0
  const pctInter   = totalValue > 0 ? (partInter  / totalValue) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Rendement vs marché */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Rendement</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest">Rendement portefeuille (est.)</p>
            <p className="text-2xl font-semibold financial-value text-accent">
              {formatPercent(rendementMoyen, { decimals: 1 })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest">Référence marché SCPI 2024</p>
            <p className="text-2xl font-semibold financial-value text-secondary">
              {formatPercent(RENDEMENT_MARCHE_SCPI_2024, { decimals: 1 })}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted mt-3 leading-relaxed">
          Le rendement réel par SCPI (TD) n&apos;est pas disponible dans l&apos;app — valeur de
          référence utilisée. Renseignez le taux de distribution dans les métadonnées de chaque
          SCPI pour un calcul personnalisé.
        </p>
      </div>

      {/* Diversification géo */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Diversification géographique</p>
        <div className="space-y-2.5">
          <GeoBar label="France"        pct={pctFrance} value={partFrance} color="bg-accent" />
          <GeoBar label="Europe (hors France)" pct={pctEurope} value={partEurope} color="bg-blue-400" />
          <GeoBar label="International" pct={pctInter}  value={partInter}  color="bg-warning" />
        </div>
        {pctFrance === 100 && (
          <p className="text-xs text-warning mt-3">
            ⚠ 100 % France — diversifiez via une SCPI européenne pour réduire le risque pays.
          </p>
        )}
      </div>

      {/* Note liquidité */}
      <div className="card p-4 bg-surface-2 flex items-start gap-2.5">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-secondary leading-relaxed">
          <span className="text-primary">Les SCPI sont des actifs peu liquides</span> — délai de
          revente estimé : 3 à 6 mois (parfois plus en marché baissier). Ne pas y placer une
          épargne de précaution.
        </p>
      </div>

      <p className="text-xs text-muted">
        {scpis.length} ligne{scpis.length > 1 ? 's' : ''} · valeur totale {formatCurrency(totalValue, 'EUR', { compact: true })}
      </p>
    </div>
  )
}

function GeoBar({ label, pct, value, color }: { label: string; pct: number; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 text-right text-secondary truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right financial-value text-secondary text-xs">
        {formatPercent(pct, { decimals: 1 })} · {formatCurrency(value, 'EUR', { compact: true })}
      </span>
    </div>
  )
}
