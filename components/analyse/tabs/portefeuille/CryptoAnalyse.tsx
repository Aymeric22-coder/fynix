/**
 * Sous-onglet Portefeuille > Crypto.
 *
 * Wrap CryptoSummary existant + ajout bloc "Dominance BTC".
 */
'use client'

import { CryptoSummary } from '../../CryptoSummary'
import { formatPercent } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

export function CryptoAnalyse({ data }: Props) {
  // Dominance BTC : part du Bitcoin dans le total crypto
  const btc = data.cryptoBreakdown.find((c) =>
    /\bbitcoin\b|\bbtc\b/i.test(c.name) || /\bbitcoin\b|\bbtc\b/i.test(c.isin || ''))
  const dominanceBtcPct = btc && data.cryptoTotal > 0 ? (btc.value / data.cryptoTotal) * 100 : 0

  const niveauDominance =
    dominanceBtcPct >= 70 ? { tone: 'text-secondary', txt: 'Profil conservateur crypto — BTC est l\'actif le moins volatil de l\'écosystème.' } :
    dominanceBtcPct >= 40 ? { tone: 'text-accent',    txt: 'Profil équilibré — diversification raisonnable hors BTC.' } :
    dominanceBtcPct >  0  ? { tone: 'text-warning',   txt: 'Profil altcoin — les altcoins sont plus volatils que BTC, risque amplifié.' } :
                            { tone: 'text-muted',     txt: 'Pas de Bitcoin détecté dans votre portefeuille crypto.' }

  return (
    <div className="space-y-4">
      <CryptoSummary
        cryptoTotal={data.cryptoTotal}
        cryptoCostTotal={data.cryptoCostTotal}
        cryptoBreakdown={data.cryptoBreakdown}
        patrimoineNet={data.totalNet}
      />

      {/* Bloc Dominance BTC */}
      {data.cryptoBreakdown.length > 0 && (
        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">Dominance Bitcoin</p>
          <div className="flex items-baseline gap-3 mb-2">
            <p className="text-2xl font-semibold financial-value text-primary">
              {formatPercent(dominanceBtcPct, { decimals: 1 })}
            </p>
            <p className="text-xs text-secondary">du portefeuille crypto en BTC</p>
          </div>
          <p className={`text-xs leading-relaxed ${niveauDominance.tone}`}>{niveauDominance.txt}</p>
        </div>
      )}
    </div>
  )
}
