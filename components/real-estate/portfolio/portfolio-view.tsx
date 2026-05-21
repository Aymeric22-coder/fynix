'use client'

/**
 * Composant client orchestrateur de la liste immobilier.
 *
 * - Bandeau d'alertes cross-biens
 * - Toggle de vue : Cartes (defaut) / Tableau / Graphiques
 * - Filtres et recherche (P4 — sessionStorage)
 * - Tri (controle par le sous-composant ou la barre filtres)
 *
 * La vue Cartes reste tres proche de l'existant pour ne pas casser
 * l'UX que les utilisateurs connaissent. Tableau et Graphiques sont
 * de nouveaux composants.
 */

import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Rows3, BarChart3, Map as MapIcon, Search, X } from 'lucide-react'
import type { RealEstatePortfolioSummary, PropertySummary } from '@/lib/real-estate/portfolio-summary'
import { USAGE_TYPE_LABELS, type PropertyUsageType } from '@/types/database.types'
import { PortfolioAlertsBanner } from './portfolio-alerts-banner'
import { PropertiesTableView } from './properties-table-view'
import { PropertiesChartsView } from './properties-charts-view'
import { PropertyMap } from './property-map'

type View = 'cards' | 'table' | 'charts' | 'map'
type UsageFilter = 'all' | PropertyUsageType
type RegimeFilter = 'all' | 'micro' | 'foncier_reel' | 'lmnp' | 'lmp' | 'sci_ir' | 'sci_is'
type StatusFilter = 'all' | 'positive_cf' | 'negative_cf' | 'with_alerts'

type SortBy =
  | 'netNetYieldPct_desc'
  | 'monthlyNetCashFlow_desc'
  | 'currentValue_desc'
  | 'name_asc'

const STORAGE_KEY = 'fynix_immo_list_filters_v1'

interface FiltersState {
  view:    View
  search:  string
  usage:   UsageFilter
  regime:  RegimeFilter
  status:  StatusFilter
  sortBy:  SortBy
}

const DEFAULTS: FiltersState = {
  view:   'cards',
  search: '',
  usage:  'all',
  regime: 'all',
  status: 'all',
  sortBy: 'netNetYieldPct_desc',
}

function loadFilters(): FiltersState {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { return DEFAULTS }
}

function saveFilters(f: FiltersState) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f)) } catch { /* quota */ }
}

interface Props {
  summary:     RealEstatePortfolioSummary
  /** Slot rendu par le serveur : cartes des biens existantes (pre-filtre). */
  cardsByPropertyId: Record<string, React.ReactNode>
  /** Coordonnees pre-chargees depuis la DB (pour la vue carte). */
  coords?:     Record<string, { lat: number; lng: number } | null>
}

export function PortfolioView({ summary, cardsByPropertyId, coords = {} }: Props) {
  const [filters, setFilters] = useState<FiltersState>(DEFAULTS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setFilters(loadFilters()); setHydrated(true) }, [])
  useEffect(() => { if (hydrated) saveFilters(filters) }, [filters, hydrated])

  const filtered = useMemo(() => applyFilters(summary.properties, filters), [summary.properties, filters])

  const subSummary = useMemo<RealEstatePortfolioSummary>(() => ({
    ...summary,
    properties: filtered,
  }), [summary, filtered])

  function update<K extends keyof FiltersState>(k: K, v: FiltersState[K]) {
    setFilters(f => ({ ...f, [k]: v }))
  }

  function reset() { setFilters(DEFAULTS) }

  const hasActiveFilters =
    filters.search !== '' || filters.usage !== 'all' ||
    filters.regime !== 'all' || filters.status !== 'all'

  return (
    <div className="space-y-4">
      <PortfolioAlertsBanner alerts={summary.alerts} />

      {/* ─── Barre filtres + vues ─────────────────────────────────── */}
      <div className="card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Rechercher un bien…"
            value={filters.search}
            onChange={e => update('search', e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center text-xs">
          <Select label="Type" value={filters.usage} onChange={v => update('usage', v as UsageFilter)}>
            <option value="all">Tous types</option>
            {(Object.keys(USAGE_TYPE_LABELS) as PropertyUsageType[]).map(k => (
              <option key={k} value={k}>{USAGE_TYPE_LABELS[k]}</option>
            ))}
          </Select>
          <Select label="Régime" value={filters.regime} onChange={v => update('regime', v as RegimeFilter)}>
            <option value="all">Tous régimes</option>
            <option value="micro">Micro</option>
            <option value="foncier_reel">Foncier réel</option>
            <option value="lmnp">LMNP</option>
            <option value="lmp">LMP</option>
            <option value="sci_ir">SCI IR</option>
            <option value="sci_is">SCI IS</option>
          </Select>
          <Select label="Statut" value={filters.status} onChange={v => update('status', v as StatusFilter)}>
            <option value="all">Tous statuts</option>
            <option value="positive_cf">Cash-flow positif</option>
            <option value="negative_cf">Cash-flow négatif</option>
            <option value="with_alerts">Avec alertes</option>
          </Select>
          <Select label="Trier" value={filters.sortBy} onChange={v => update('sortBy', v as SortBy)}>
            <option value="netNetYieldPct_desc">Rdt net-net ↓</option>
            <option value="monthlyNetCashFlow_desc">Cash-flow ↓</option>
            <option value="currentValue_desc">Valeur ↓</option>
            <option value="name_asc">Nom A→Z</option>
          </Select>
          {hasActiveFilters && (
            <button onClick={reset} className="px-2 py-1 text-muted hover:text-primary inline-flex items-center gap-1">
              <X size={11} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Toggle vues */}
        <div className="flex items-center border border-border rounded-md overflow-hidden self-end lg:self-auto">
          <ViewBtn current={filters.view} value="cards"  icon={LayoutGrid} label="Cartes"    onClick={() => update('view', 'cards')} />
          <ViewBtn current={filters.view} value="table"  icon={Rows3}      label="Tableau"   onClick={() => update('view', 'table')} />
          <ViewBtn current={filters.view} value="charts" icon={BarChart3}  label="Graphiques" onClick={() => update('view', 'charts')} />
          <ViewBtn current={filters.view} value="map"    icon={MapIcon}    label="Carte"     onClick={() => update('view', 'map')} />
        </div>
      </div>

      {/* ─── Resume sous-portefeuille filtre ──────────────────────── */}
      {hasActiveFilters && filtered.length !== summary.properties.length && (
        <p className="text-xs text-muted px-1">
          {filtered.length} bien{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
          {' '}sur {summary.properties.length}
        </p>
      )}

      {/* ─── Vue active ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-secondary">
          Aucun bien ne correspond aux filtres.
        </div>
      ) : filters.view === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(p => (
            <div key={p.id}>{cardsByPropertyId[p.id] ?? null}</div>
          ))}
        </div>
      ) : filters.view === 'table' ? (
        <PropertiesTableView summary={subSummary} />
      ) : filters.view === 'charts' ? (
        <PropertiesChartsView summary={subSummary} />
      ) : (
        <PropertyMap properties={filtered} coords={coords} />
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function applyFilters(properties: PropertySummary[], f: FiltersState): PropertySummary[] {
  const term = f.search.trim().toLowerCase()
  const matchesRegime = (p: PropertySummary): boolean => {
    if (f.regime === 'all') return true
    const r = p.fiscalRegime
    if (!r) return false
    switch (f.regime) {
      case 'micro':        return r === 'lmnp_micro' || r === 'foncier_micro'
      case 'foncier_reel': return r === 'foncier_nu'
      case 'lmnp':         return r === 'lmnp_reel'
      case 'lmp':          return r === 'lmp'
      case 'sci_ir':       return r === 'sci_ir'
      case 'sci_is':       return r === 'sci_is'
      default: return true
    }
  }

  const matches = (p: PropertySummary): boolean => {
    if (term && !p.name.toLowerCase().includes(term) && !(p.city ?? '').toLowerCase().includes(term)) return false
    if (f.usage !== 'all' && p.usageType !== f.usage) return false
    if (!matchesRegime(p)) return false
    if (f.status === 'positive_cf' && p.monthlyNetCashFlow <= 0) return false
    if (f.status === 'negative_cf' && p.monthlyNetCashFlow >= 0) return false
    if (f.status === 'with_alerts' && !p.hasAlerts)              return false
    return true
  }

  const sorted = properties.filter(matches)
  sorted.sort((a, b) => {
    switch (f.sortBy) {
      case 'netNetYieldPct_desc':     return b.netNetYieldPct - a.netNetYieldPct
      case 'monthlyNetCashFlow_desc': return b.monthlyNetCashFlow - a.monthlyNetCashFlow
      case 'currentValue_desc':       return b.currentValue - a.currentValue
      case 'name_asc':                return a.name.localeCompare(b.name)
    }
  })
  return sorted
}

function Select({ label, value, onChange, children }: {
  label:    string
  value:    string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-secondary">
      <span className="text-muted text-[10px] uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs text-primary focus:outline-none focus:border-accent"
      >
        {children}
      </select>
    </label>
  )
}

function ViewBtn({ current, value, icon: Icon, label, onClick }: {
  current: View
  value:   View
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:    any
  label:   string
  onClick: () => void
}) {
  const active = current === value
  return (
    <button
      onClick={onClick}
      title={label}
      className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 transition-colors ${active ? 'bg-accent text-bg' : 'text-secondary hover:text-primary'}`}
    >
      <Icon size={12} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
