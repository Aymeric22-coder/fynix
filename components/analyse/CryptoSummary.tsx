/**
 * Section "Crypto" dans Analyse — apporte UNIQUEMENT ce qui n'est PAS
 * déjà dans /portefeuille (tableau, PRU, prix, P&L par actif).
 *
 * 3 blocs ciblés :
 *   1. Poids dans le patrimoine global (jauge + interprétation)
 *   2. Fiscalité estimée (PV/MV latente + flat tax 30 %)
 *   3. Note contextuelle (rôle diversification / corrélation)
 */
'use client'

import { Bitcoin, AlertCircle, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props {
  cryptoTotal:     number
  cryptoCostTotal: number
  cryptoBreakdown: PatrimoineComplet['cryptoBreakdown']
  /** Patrimoine net total — sert au calcul du poids. */
  patrimoineNet:   number
}

const FLAT_TAX_PCT = 30  // PFU (Prélèvement Forfaitaire Unique) France

export function CryptoSummary({ cryptoTotal, cryptoCostTotal, cryptoBreakdown, patrimoineNet }: Props) {
  if (cryptoBreakdown.length === 0 || cryptoTotal <= 0) return null

  // ── BLOC 1 : Poids dans le patrimoine ──────────────────────────
  const partPct = patrimoineNet > 0 ? (cryptoTotal / patrimoineNet) * 100 : 0
  const niveauPart =
    partPct < 5  ? { tone: 'aligned',  text: 'Exposition faible — rôle marginal' } :
    partPct < 10 ? { tone: 'modere',   text: 'Exposition modérée — dans les normes pour un profil dynamique' } :
    partPct < 15 ? { tone: 'modere',   text: 'Exposition significative — vérifiez la cohérence avec votre profil' } :
                   { tone: 'eleve',    text: '⚠ Exposition élevée — actif très volatile représentant une part importante de votre patrimoine' }

  // ── BLOC 2 : Fiscalité estimée ─────────────────────────────────
  const pvLatente = cryptoTotal - cryptoCostTotal
  const impotEstime = pvLatente > 0 ? pvLatente * (FLAT_TAX_PCT / 100) : 0
  const dataIncompletes = cryptoCostTotal <= 0  // pas de PRU renseigné

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Bitcoin size={13} className="text-secondary" />
        <p className="text-xs text-secondary uppercase tracking-widest">Crypto — analyse complémentaire</p>
        <span className="text-xs text-muted ml-auto">
          {formatCurrency(cryptoTotal, 'EUR', { compact: true })} · {cryptoBreakdown.length} actif{cryptoBreakdown.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-4">
        {/* ─── BLOC 1 ── Poids dans le patrimoine ─── */}
        <div className="bg-surface-2 rounded-lg p-4">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Poids dans le patrimoine total</p>
          <div className="flex items-baseline gap-3 mb-2">
            <p className="text-2xl font-semibold financial-value text-primary">
              {formatPercent(partPct, { decimals: 1 })}
            </p>
            <p className="text-xs text-secondary">
              soit {formatCurrency(cryptoTotal, 'EUR', { decimals: 0 })} sur {formatCurrency(patrimoineNet, 'EUR', { compact: true })}
            </p>
          </div>
          {/* Jauge linéaire avec repères 5 / 10 / 15 % */}
          <JaugeExposition pct={partPct} />
          <p className={cn(
            'text-xs leading-relaxed mt-3',
            niveauPart.tone === 'aligned' ? 'text-secondary' :
            niveauPart.tone === 'modere'  ? 'text-warning' :
                                            'text-danger',
          )}>
            {niveauPart.text}
          </p>
        </div>

        {/* ─── BLOC 2 ── Fiscalité estimée ─── */}
        <div className="bg-surface-2 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            {pvLatente > 0
              ? <TrendingUp size={13} className="text-accent" />
              : <TrendingDown size={13} className="text-danger" />}
            <p className="text-[10px] text-muted uppercase tracking-widest">Fiscalité estimée (cession totale)</p>
          </div>

          {dataIncompletes ? (
            <div className="flex items-start gap-2 text-xs text-muted">
              <AlertCircle size={13} className="text-warning flex-shrink-0 mt-0.5" />
              <span>PRU non renseigné — impossible d&apos;estimer la plus/moins-value latente.</span>
            </div>
          ) : pvLatente > 0 ? (
            <>
              <p className="text-base text-primary">
                Plus-value latente :{' '}
                <span className="text-accent font-semibold financial-value">
                  +{formatCurrency(pvLatente, 'EUR', { decimals: 0 })}
                </span>
                <span className="text-xs text-muted ml-2">
                  (coût {formatCurrency(cryptoCostTotal, 'EUR', { decimals: 0 })} → valeur {formatCurrency(cryptoTotal, 'EUR', { decimals: 0 })})
                </span>
              </p>
              <p className="text-sm text-secondary mt-1.5">
                Imposition estimée si cession totale :{' '}
                <span className="text-warning font-medium financial-value">
                  {formatCurrency(impotEstime, 'EUR', { decimals: 0 })}
                </span>
                <span className="text-xs text-muted ml-1">(flat tax {FLAT_TAX_PCT} %)</span>
              </p>
              <p className="text-sm text-secondary mt-1.5">
                Net après impôt :{' '}
                <span className="text-primary font-medium financial-value">
                  {formatCurrency(cryptoTotal - impotEstime, 'EUR', { decimals: 0 })}
                </span>
              </p>
            </>
          ) : (
            <>
              <p className="text-base text-primary">
                Moins-value latente :{' '}
                <span className="text-danger font-semibold financial-value">
                  {formatCurrency(pvLatente, 'EUR', { decimals: 0 })}
                </span>
              </p>
              <p className="text-xs text-secondary mt-1.5">
                Une cession permettrait de constater cette perte fiscalement (imputable sur d&apos;autres plus-values de même nature).
              </p>
            </>
          )}

          <p className="text-[10px] text-muted mt-2.5 italic">
            Estimation indicative — consultez un conseiller fiscal pour votre situation personnelle.
          </p>
        </div>

        {/* ─── BLOC 3 ── Note contextuelle ─── */}
        <div className="bg-surface-2 rounded-lg p-4 flex items-start gap-2.5">
          <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Rôle de la crypto</p>
            <p className="text-xs text-secondary leading-relaxed">
              La crypto joue un rôle de <span className="text-primary">diversification asymétrique</span> —
              faible corrélation avec vos ETF sur le long terme, mais corrélations qui
              <span className="text-warning"> augmentent en période de stress de marché</span> (les actifs risqués
              se mettent à bouger ensemble lors des krachs).
            </p>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted mt-4 pt-3 border-t border-border leading-relaxed">
        La crypto est analysée séparément car ce n&apos;est ni un secteur d&apos;activité ni une
        exposition pays. Elle n&apos;influence pas les analyses sectorielle et géographique du
        portefeuille financier. Le détail par actif (PRU, prix, P&amp;L) est dans la section{' '}
        <a href="/portefeuille" className="text-accent underline">Portefeuille</a>.
      </p>
    </div>
  )
}

/**
 * Jauge linéaire avec 3 zones (vert 0-5 / orange 5-15 / rouge 15+).
 * Le curseur est positionné à `pct` sur une échelle 0-25 (cap visuel).
 */
function JaugeExposition({ pct }: { pct: number }) {
  const cap = 25
  const position = Math.min(100, (pct / cap) * 100)
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden flex">
      <div className="bg-accent/70"  style={{ width: '20%' }} />   {/* 0-5 % */}
      <div className="bg-warning/70" style={{ width: '40%' }} />   {/* 5-15 % */}
      <div className="bg-danger/70"  style={{ width: '40%' }} />   {/* 15-25 % */}
      {/* Curseur */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-primary"
        style={{ left: `${position}%`, transform: `translate(-50%, -50%)` }}
        title={`${pct.toFixed(1)} %`}
      />
    </div>
  )
}
