/**
 * Section "Crypto" — répartition interne des cryptomonnaies détenues.
 *
 * La crypto est volontairement exclue des analyses sectorielle/géo
 * (pas de "secteur" ni de "pays" pour un actif décentralisé). Elle a
 * sa propre section avec donut + liste détaillée.
 */
'use client'

import { DonutChart } from '@/components/charts/donut-chart'
import { Bitcoin } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  cryptoTotal:     number
  cryptoBreakdown: Array<{ isin: string; name: string; value: number; pct: number }>
}

// Palette cohérente avec le reste de l'app
const PALETTE = ['#f59e0b', '#a78bfa', '#10b981', '#3b82f6', '#ef4444', '#22d3ee', '#ec4899', '#facc15', '#71717a']

export function CryptoSummary({ cryptoTotal, cryptoBreakdown }: Props) {
  if (cryptoBreakdown.length === 0 || cryptoTotal <= 0) return null

  const data = cryptoBreakdown.map((c, i) => ({
    type:    c.isin || c.name,
    label:   c.name,
    value:   c.value,
    percent: c.pct,
    color:   PALETTE[i % PALETTE.length]!,
  }))

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Bitcoin size={13} className="text-secondary" />
        <p className="text-xs text-secondary uppercase tracking-widest">Crypto</p>
        <span className="text-xs text-muted ml-auto">
          {cryptoBreakdown.length} actif{cryptoBreakdown.length > 1 ? 's' : ''}
        </span>
      </div>

      <DonutChart
        data={data}
        centerLabel="Total crypto"
        centerValue={formatCurrency(cryptoTotal, 'EUR', { compact: true })}
      />

      <p className="text-[10px] text-muted mt-4 pt-3 border-t border-border leading-relaxed">
        La crypto est analysée séparément car ce n&apos;est ni un secteur
        d&apos;activité ni une exposition pays. Elle n&apos;influence pas
        les analyses sectorielle et géographique du portefeuille financier.
      </p>
    </div>
  )
}
