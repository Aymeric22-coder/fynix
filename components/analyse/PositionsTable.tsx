/**
 * Tableau détaillé des positions, SYNCHRONISÉ avec les analyses
 * sectorielle / géographique (utilise la même expansion ETF).
 *
 *   - Filtres chips classes d'actif (+ chip "ETF non mappés")
 *   - Filtres sector / zone listent les VRAIES catégories (pas les
 *     fallbacks "ETF Diversifié" / "Autres")
 *   - Pour les ETF mappés : colonne Exposition affiche le top 3 des
 *     secteurs avec leur % (tooltip pour tout voir)
 *   - Filtrage intelligent : "Technologie" inclut aussi les ETF qui
 *     ont une exposition Tech
 *   - Indicateur de complétude par ligne (✅ / ⚠️ / ❌)
 */
'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { Field, Select } from '@/components/ui/field'
import { Chip } from '@/components/profil/Chip'
import { formatCurrency, formatPercent, formatQuantity, cn } from '@/lib/utils/format'
import { translateSector } from '@/lib/analyse/sectorMapping'
import { geoZone } from '@/lib/analyse/geoMapping'
import { getEtfComposition } from '@/lib/analyse/etfCompositions'
import { BENCHMARK_SECTOR_MSCI_WORLD, BENCHMARK_GEO_MSCI_ACWI } from '@/lib/analyse/benchmarks'
import type { EnrichedPosition, AnalyseAssetType } from '@/types/analyse'

interface Props {
  positions: EnrichedPosition[]
}

const ASSET_TYPES: Array<{ id: AnalyseAssetType; label: string }> = [
  { id: 'stock',   label: 'Actions' },
  { id: 'etf',     label: 'ETF / Fonds' },
  { id: 'crypto',  label: 'Crypto' },
  { id: 'bond',    label: 'Obligataire' },
  { id: 'scpi',    label: 'Immo papier' },
  { id: 'metal',   label: 'Métaux précieux' },
  { id: 'unknown', label: 'Non classé' },
]

interface Exposition {
  /** Top secteurs avec leur pondération (100 = pos directe, sinon ETF compo). */
  sectors: Array<{ secteur: string; pct: number }>
  /** Zones avec pondération. */
  zones:   Array<{ zone: string; pct: number }>
  /** Statut de complétude. */
  status:  'complete' | 'partial' | 'unknown'
  /** Détecté comme ETF non mappé (compo absente). */
  etfUnmapped: boolean
}

/**
 * Calcule la décomposition sectorielle/zone réelle d'une position.
 * Source unique de vérité — utilisée pour le filtrage ET l'affichage.
 */
function computeExposition(p: EnrichedPosition): Exposition {
  // ETF : tente la lookup composition
  if (p.asset_type === 'etf' && p.isin) {
    const compo = getEtfComposition(p.isin)
    if (compo) {
      const sumS = Object.values(compo.sectors).reduce((s, v) => s + v, 0) || 100
      const sumZ = Object.values(compo.zones).reduce((s, v) => s + v, 0) || 100
      return {
        sectors: Object.entries(compo.sectors).map(([secteur, pct]) => ({ secteur, pct: (pct / sumS) * 100 }))
                       .sort((a, b) => b.pct - a.pct),
        zones:   Object.entries(compo.zones).map(([zone, pct]) => ({ zone, pct: (pct / sumZ) * 100 }))
                       .sort((a, b) => b.pct - a.pct),
        status:  'complete',
        etfUnmapped: false,
      }
    }
    return {
      sectors:     [{ secteur: 'ETF non mappé', pct: 100 }],
      zones:       [{ zone: 'ETF non mappé', pct: 100 }],
      status:      'partial',
      etfUnmapped: true,
    }
  }

  // Action individuelle
  if (p.asset_type === 'stock') {
    const sec = translateSector(p.sector)
    const zon = p.country ? (geoZone(p.country) as string) : null
    if (sec && zon && sec !== 'Non identifié') {
      return {
        sectors: [{ secteur: sec, pct: 100 }],
        zones:   [{ zone: zon, pct: 100 }],
        status:  'complete',
        etfUnmapped: false,
      }
    }
    return {
      sectors: [{ secteur: 'Non identifié', pct: 100 }],
      zones:   [{ zone: 'Non identifié', pct: 100 }],
      status:  'unknown',
      etfUnmapped: false,
    }
  }

  // SCPI / immo papier
  if (p.asset_type === 'scpi') {
    const zon = p.country ? (geoZone(p.country) as string) : 'Europe'
    return {
      sectors: [{ secteur: 'Immobilier', pct: 100 }],
      zones:   [{ zone: zon, pct: 100 }],
      status:  'complete',
      etfUnmapped: false,
    }
  }

  // Métaux précieux
  if (p.asset_type === 'metal') {
    return {
      sectors: [{ secteur: 'Matières premières', pct: 100 }],
      zones:   [{ zone: 'Global', pct: 100 }],
      status:  'complete',
      etfUnmapped: false,
    }
  }

  // Crypto
  if (p.asset_type === 'crypto') {
    return {
      sectors: [{ secteur: 'Crypto', pct: 100 }],
      zones:   [{ zone: 'Global', pct: 100 }],
      status:  'complete',
      etfUnmapped: false,
    }
  }

  // Obligations / unknown
  if (p.asset_type === 'bond') {
    return {
      sectors: [{ secteur: 'Obligations souveraines', pct: 100 }],
      zones:   [{ zone: p.country ? (geoZone(p.country) as string) : 'Europe', pct: 100 }],
      status:  'complete',
      etfUnmapped: false,
    }
  }

  return {
    sectors: [{ secteur: 'Non identifié', pct: 100 }],
    zones:   [{ zone: 'Non identifié', pct: 100 }],
    status:  'unknown',
    etfUnmapped: false,
  }
}

export function PositionsTable({ positions }: Props) {
  const [activeTypes,   setActiveTypes]   = useState<Set<AnalyseAssetType>>(new Set())
  const [unmappedOnly,  setUnmappedOnly]  = useState(false)
  const [sector, setSector] = useState<string>('')
  const [zone,   setZone]   = useState<string>('')

  // Pré-calcule l'exposition de chaque position une seule fois
  const positionsWithExpo = useMemo(
    () => positions.map((p) => ({ ...p, exposition: computeExposition(p) })),
    [positions],
  )

  // Listes de filtres : on prend les benchmarks comme source canonique,
  // augmentés des valeurs réellement présentes dans le portefeuille.
  const allSectors = useMemo(() => {
    const set = new Set<string>(Object.keys(BENCHMARK_SECTOR_MSCI_WORLD))
    for (const p of positionsWithExpo) {
      for (const s of p.exposition.sectors) set.add(s.secteur)
    }
    return Array.from(set).sort()
  }, [positionsWithExpo])

  const allZones = useMemo(() => {
    const set = new Set<string>(Object.keys(BENCHMARK_GEO_MSCI_ACWI))
    for (const p of positionsWithExpo) {
      for (const z of p.exposition.zones) set.add(z.zone)
    }
    return Array.from(set).sort()
  }, [positionsWithExpo])

  // Filtrage : un secteur match si N'IMPORTE QUELLE compo l'inclut
  // (les ETF Tech 23 % matchent "Technologie")
  const filtered = useMemo(() => {
    return positionsWithExpo
      .filter((p) => activeTypes.size === 0 || activeTypes.has(p.asset_type))
      .filter((p) => !unmappedOnly || p.exposition.etfUnmapped)
      .filter((p) => !sector || p.exposition.sectors.some((s) => s.secteur === sector))
      .filter((p) => !zone   || p.exposition.zones.some((z) => z.zone === zone))
      .sort((a, b) => b.current_value - a.current_value)
  }, [positionsWithExpo, activeTypes, unmappedOnly, sector, zone])

  function toggleType(t: AnalyseAssetType) {
    const next = new Set(activeTypes)
    if (next.has(t)) next.delete(t); else next.add(t)
    setActiveTypes(next)
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Détail des positions</p>
          <p className="text-xs text-muted mt-0.5">{filtered.length} sur {positions.length} positions</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPES.map((t) => (
            <Chip key={t.id} active={activeTypes.has(t.id)} onClick={() => toggleType(t.id)}>
              {t.label}
            </Chip>
          ))}
          <Chip active={unmappedOnly} onClick={() => setUnmappedOnly((v) => !v)}>
            ⚠ ETF non mappés
          </Chip>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Secteur (synchro analyse)">
            <Select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Tous</option>
              {allSectors.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Zone géographique (synchro analyse)">
            <Select value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">Toutes</option>
              {allZones.map((z) => <option key={z}>{z}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-secondary uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left  py-2 font-medium">Nom</th>
              <th className="text-left  py-2 font-medium hidden md:table-cell">ISIN</th>
              <th className="text-left  py-2 font-medium">Exposition principale</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">Quantité</th>
              <th className="text-right py-2 font-medium hidden lg:table-cell">PRU</th>
              <th className="text-right py-2 font-medium">Prix</th>
              <th className="text-right py-2 font-medium">Valeur</th>
              <th className="text-right py-2 font-medium">+/−</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">Poids</th>
              <th className="text-center py-2 font-medium" title="Complétude des données">État</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={`${p.isin || p.name}-${i}`} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                <td className="py-2.5 max-w-[200px]">
                  <p className="text-primary truncate">{p.name}</p>
                  {p.price_estimated && <p className="text-[10px] text-warning">prix estimé (PRU)</p>}
                </td>
                <td className="py-2.5 text-muted text-xs hidden md:table-cell">{p.isin || '—'}</td>
                <td className="py-2.5 max-w-[260px]">
                  <ExpositionCell exposition={p.exposition} />
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                  {formatQuantity(p.quantity, 4)}
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden lg:table-cell">
                  {formatCurrency(p.pru, p.currency, { decimals: 2 })}
                </td>
                <td className="py-2.5 text-right financial-value text-primary">
                  {formatCurrency(p.current_price, p.currency, { decimals: 2 })}
                </td>
                <td className="py-2.5 text-right financial-value text-primary">
                  {formatCurrency(p.current_value, 'EUR', { decimals: 0 })}
                </td>
                <td className={`py-2.5 text-right financial-value ${p.gain_loss >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {formatCurrency(p.gain_loss, 'EUR', { decimals: 0, sign: true })}
                  <span className="text-xs text-muted ml-1 hidden sm:inline">
                    ({formatPercent(p.gain_loss_pct, { sign: true })})
                  </span>
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                  {formatPercent(p.weight_in_portfolio, { decimals: 1 })}
                </td>
                <td className="py-2.5 text-center">
                  <StatusBadge status={p.exposition.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-secondary text-sm">
                  Aucune position ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────

function ExpositionCell({ exposition }: { exposition: Exposition }) {
  const top3   = exposition.sectors.slice(0, 3)
  const others = exposition.sectors.slice(3)
  const allTooltip = exposition.sectors
    .map((s) => `${s.secteur} ${s.pct.toFixed(0)} %`)
    .join(' · ')

  if (exposition.etfUnmapped) {
    return <span className="text-xs text-muted italic" title="ISIN ETF non référencé dans ETF_COMPOSITIONS — secteurs et zones non décomposés">Non décomposé</span>
  }
  if (exposition.status === 'unknown') {
    return <span className="text-xs text-muted italic">Non identifié</span>
  }

  // Cas action / SCPI / crypto / métal : un seul secteur + une zone
  if (top3.length === 1 && top3[0]!.pct >= 99) {
    const zone = exposition.zones[0]?.zone ?? '—'
    return (
      <div className="text-xs">
        <span className="text-primary">{top3[0]!.secteur}</span>
        <span className="text-muted"> · </span>
        <span className="text-secondary">{zone}</span>
      </div>
    )
  }

  // ETF mappé : top 3 secteurs + indicateur si plus
  return (
    <div className="text-xs" title={allTooltip}>
      {top3.map((s, i) => (
        <span key={s.secteur}>
          <span className="text-primary">{s.secteur}</span>
          <span className="text-muted"> {s.pct.toFixed(0)} %</span>
          {i < top3.length - 1 && <span className="text-muted"> · </span>}
        </span>
      ))}
      {others.length > 0 && (
        <span className="text-muted ml-1.5 cursor-help" title={allTooltip}>+{others.length}…</span>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Exposition['status'] }) {
  if (status === 'complete') {
    return (
      <span title="Données complètes (ISIN enrichi + décomposé)" className="inline-flex">
        <CheckCircle2 size={14} className="text-accent" />
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span title="Données partielles (ETF non mappé dans la table)" className="inline-flex">
        <AlertCircle size={14} className="text-warning" />
      </span>
    )
  }
  return (
    <span title="Non identifié (ISIN non trouvé)" className="inline-flex">
      <XCircle size={14} className="text-danger" />
    </span>
  )
}

void cn  // utilisé indirectement via classes Tailwind
