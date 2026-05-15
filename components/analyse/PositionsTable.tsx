/**
 * Tableau détaillé de toutes les positions du portefeuille avec filtres :
 *   - chips classes d'actif
 *   - select secteur
 *   - select zone géographique
 *
 * Tri par défaut : valeur de marché décroissante.
 */
'use client'

import { useState, useMemo } from 'react'
import { Field, Select } from '@/components/ui/field'
import { Chip } from '@/components/profil/Chip'
import { formatCurrency, formatPercent, formatQuantity } from '@/lib/utils/format'
import { translateSector } from '@/lib/analyse/sectorMapping'
import { geoZone } from '@/lib/analyse/geoMapping'
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
  { id: 'unknown', label: 'Non classé' },
]

export function PositionsTable({ positions }: Props) {
  const [activeTypes, setActiveTypes] = useState<Set<AnalyseAssetType>>(new Set())
  const [sector, setSector]           = useState<string>('')
  const [zone,   setZone]             = useState<string>('')

  // Listes des valeurs distinctes pour les selects
  const allSectors = useMemo(
    () => Array.from(new Set(positions.map((p) => translateSector(p.sector)).filter(Boolean) as string[])).sort(),
    [positions],
  )
  const allZones = useMemo(
    () => Array.from(new Set(positions.map((p) => p.country ? geoZone(p.country) : null).filter(Boolean) as string[])).sort(),
    [positions],
  )

  const filtered = useMemo(() => {
    return positions
      .filter((p) => activeTypes.size === 0 || activeTypes.has(p.asset_type))
      .filter((p) => !sector || translateSector(p.sector) === sector)
      .filter((p) => !zone   || (p.country && geoZone(p.country) === zone))
      .sort((a, b) => b.current_value - a.current_value)
  }, [positions, activeTypes, sector, zone])

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
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Secteur">
            <Select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Tous</option>
              {allSectors.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Zone géographique">
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
              <th className="text-left  py-2 font-medium hidden lg:table-cell">Secteur</th>
              <th className="text-left  py-2 font-medium hidden lg:table-cell">Pays</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">Quantité</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">PRU</th>
              <th className="text-right py-2 font-medium">Prix</th>
              <th className="text-right py-2 font-medium">Valeur</th>
              <th className="text-right py-2 font-medium">+/−</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">Poids</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={`${p.isin || p.name}-${i}`} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                <td className="py-2.5 max-w-[200px]">
                  <p className="text-primary truncate">{p.name}</p>
                  {p.price_estimated && (
                    <p className="text-[10px] text-warning">prix estimé (PRU)</p>
                  )}
                </td>
                <td className="py-2.5 text-muted text-xs hidden md:table-cell">{p.isin || '—'}</td>
                <td className="py-2.5 text-secondary text-xs hidden lg:table-cell">{translateSector(p.sector) ?? '—'}</td>
                <td className="py-2.5 text-secondary text-xs hidden lg:table-cell">{p.country ?? '—'}</td>
                <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                  {formatQuantity(p.quantity, 4)}
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
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
