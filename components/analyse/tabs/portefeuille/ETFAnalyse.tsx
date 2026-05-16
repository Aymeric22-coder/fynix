/**
 * Sous-onglet Portefeuille > ETF / Fonds.
 *
 * Composition décomposée par ETF + sectorielle/géo consolidée +
 * détection overlap (redondance entre ETF).
 */
'use client'

import { useMemo } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { analyseSubset } from '@/lib/analyse/subsetAnalyse'
import { getEtfComposition } from '@/lib/analyse/etfCompositions'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { SectorielleChart } from '../../SectorielleChart'
import { GeographiqueChart } from '../../GeographiqueChart'
import { FiabiliteBadge } from '../../FiabiliteBadge'
import type { PatrimoineComplet, EnrichedPosition } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

export function ETFAnalyse({ data }: Props) {
  const etfs = useMemo(
    () => data.positions.filter((p) => p.asset_type === 'etf'),
    [data.positions],
  )
  const subset = useMemo(() => analyseSubset(etfs), [etfs])

  // Détection overlap : pour chaque paire d'ETF mappés, calculer
  // l'intersection pondérée sur les zones géographiques.
  const overlap = useMemo(() => calculerOverlap(etfs), [etfs])

  const unmappedValue  = etfs.filter((e) => e.isin && !getEtfComposition(e.isin))
                              .reduce((s, e) => s + e.current_value, 0)
  const totalEtfValue  = etfs.reduce((s, e) => s + e.current_value, 0)
  const pctUnmapped    = totalEtfValue > 0 ? (unmappedValue / totalEtfValue) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Bandeau warnings si ETF non mappés */}
      {pctUnmapped > 0 && (
        <div className="card p-4 bg-warning-muted border-warning/30 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-warning flex-shrink-0 mt-0.5" />
            <p className="text-primary">
              <span className="text-warning font-medium">{pctUnmapped.toFixed(0)} %</span> de vos ETF
              ne sont pas décomposés dans la table — analyse sectorielle/géo partielle.
            </p>
          </div>
        </div>
      )}

      {/* Composition décomposée par ETF */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Composition par ETF</p>
        <div className="space-y-3">
          {etfs.length === 0 && <p className="text-sm text-secondary">Aucun ETF dans le portefeuille.</p>}
          {etfs.map((etf) => <EtfRow key={etf.isin || etf.name} etf={etf} />)}
        </div>
      </div>

      <FiabiliteBadge fiabilite={subset.fiabilite} unmappedAll={[]} />

      {/* Sectorielle + Géo consolidées (ETF uniquement) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectorielleChart  buckets={subset.secteur} score={subset.scoreSectoriel} />
        <GeographiqueChart buckets={subset.geo}     score={subset.scoreGeo} />
      </div>

      {/* Overlap */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Redondance entre ETF</p>
        {overlap.length === 0 ? (
          <p className="text-sm text-secondary">Aucune redondance significative détectée (ou ETF non mappés).</p>
        ) : (
          <ul className="space-y-2">
            {overlap.map((o, i) => (
              <li key={i} className="text-sm text-secondary flex items-start gap-2">
                <span className="text-warning">⚠</span>
                <span>
                  <span className="text-primary">{o.a}</span> ↔ <span className="text-primary">{o.b}</span> :
                  redondance ≈ <span className="text-warning font-medium">{o.pct.toFixed(0)} %</span> ({o.zone})
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-muted mt-3 leading-relaxed">
          La redondance mesure si plusieurs ETF couvrent la même zone géographique ou les mêmes
          secteurs. Une redondance &gt; 50 % peut signifier que vous payez deux fois pour la même
          exposition.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Détection overlap (paires d'ETF mappés avec forte intersection zone)
// ─────────────────────────────────────────────────────────────────

function calculerOverlap(etfs: EnrichedPosition[]): Array<{ a: string; b: string; pct: number; zone: string }> {
  const mappes = etfs.map((e) => {
    const compo = e.isin ? getEtfComposition(e.isin) : null
    return compo ? { name: e.name, zones: compo.zones } : null
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  const out: Array<{ a: string; b: string; pct: number; zone: string }> = []
  for (let i = 0; i < mappes.length; i++) {
    for (let j = i + 1; j < mappes.length; j++) {
      const A = mappes[i]!, B = mappes[j]!
      // Cherche la zone où les deux ETF ont le plus d'exposition commune
      let topZone = '', topMin = 0
      for (const zone of Object.keys(A.zones)) {
        const inter = Math.min(A.zones[zone] ?? 0, B.zones[zone] ?? 0)
        if (inter > topMin) { topMin = inter; topZone = zone }
      }
      if (topMin >= 50) out.push({ a: A.name, b: B.name, pct: topMin, zone: topZone })
    }
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, 5)
}

// ─────────────────────────────────────────────────────────────────
// Ligne ETF avec mini-décomposition
// ─────────────────────────────────────────────────────────────────

function EtfRow({ etf }: { etf: EnrichedPosition }) {
  const compo = etf.isin ? getEtfComposition(etf.isin) : null

  return (
    <div className="bg-surface-2 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm text-primary truncate">{etf.name}</p>
          <p className="text-[10px] text-muted">{etf.isin || '—'} · {formatCurrency(etf.current_value, 'EUR', { compact: true })}</p>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
          compo ? 'bg-accent-muted text-accent' : 'bg-warning-muted text-warning',
        )}>
          {compo ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
          {compo ? 'Mappé' : 'Non mappé'}
        </span>
      </div>

      {compo ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
          <div>
            <p className="text-muted uppercase tracking-widest mb-1">Top secteurs</p>
            <p className="text-secondary">
              {Object.entries(compo.sectors).sort(([, a], [, b]) => b - a).slice(0, 3)
                .map(([s, p]) => `${s} ${p}%`).join(' · ')}
            </p>
          </div>
          <div>
            <p className="text-muted uppercase tracking-widest mb-1">Top zones</p>
            <p className="text-secondary">
              {Object.entries(compo.zones).sort(([, a], [, b]) => b - a).slice(0, 3)
                .map(([z, p]) => `${z} ${p}%`).join(' · ')}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-muted italic">
          Composition non référencée — ajoutez l&apos;ISIN dans <code>lib/analyse/etfCompositions.ts</code>.
        </p>
      )}
    </div>
  )
}

// Helper formatPercent inutilisé ici — silence le linter
void formatPercent
