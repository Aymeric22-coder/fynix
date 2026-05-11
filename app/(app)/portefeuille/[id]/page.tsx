import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wallet, TrendingUp, Activity, LineChart as LineChartIcon,
  Receipt, Hash, Globe,
} from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PriceHistoryChart, type PricePoint } from '@/components/portfolio/price-history-chart'
import {
  formatCurrency, formatPercent, formatQuantity, formatDate,
  ASSET_CLASS_LABELS,
} from '@/lib/utils/format'
import type { AssetClass, CurrencyCode } from '@/types/database.types'

export const metadata: Metadata = { title: 'Détail position' }

type Props = { params: Promise<{ id: string }> }

export default async function PositionDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Position + instrument + enveloppe ──────────────────────────────
  const { data: position } = await supabase
    .from('positions')
    .select(`
      id, instrument_id, envelope_id, quantity, average_price, currency,
      broker, acquisition_date, notes, status, created_at,
      instrument:instruments!instrument_id (
        id, name, ticker, isin, asset_class, asset_subclass, currency,
        sector, geography
      ),
      envelope:financial_envelopes!envelope_id (
        id, name, envelope_type, broker
      )
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (!position) notFound()

  type InstrumentRow = {
    id: string; name: string; ticker: string | null; isin: string | null
    asset_class: AssetClass; asset_subclass: string | null
    currency: CurrencyCode; sector: string | null; geography: string | null
  }
  type EnvelopeRow = { id: string; name: string; envelope_type: string; broker: string | null }

  const instrument = (Array.isArray(position.instrument)
    ? position.instrument[0]
    : position.instrument) as InstrumentRow | null
  const envelope   = (Array.isArray(position.envelope)
    ? position.envelope[0]
    : position.envelope) as EnvelopeRow | null

  if (!instrument) notFound()

  // ── Historique des prix de l'instrument (180 derniers points) ──────
  const { data: priceRows } = await supabase
    .from('instrument_prices')
    .select('price, currency, priced_at, source')
    .eq('instrument_id', instrument.id)
    .order('priced_at', { ascending: false })
    .limit(180)

  const priceHistory: PricePoint[] = (priceRows ?? []).slice().reverse().map((r) => ({
    priced_at: r.priced_at as string,
    price:     Number(r.price),
    source:    r.source as string,
  }))

  const latestPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : null

  // ── Transactions liées (position_id OU instrument_id) ──────────────
  const { data: txRows } = await supabase
    .from('transactions')
    .select('id, transaction_type, amount, quantity, unit_price, fees, executed_at, label, notes')
    .eq('user_id', user!.id)
    .or(`position_id.eq.${position.id},instrument_id.eq.${instrument.id}`)
    .order('executed_at', { ascending: false })
    .limit(50)

  // ── Calculs dérivés ──────────────────────────────────────────────────
  const qty       = Number(position.quantity)
  const pru       = Number(position.average_price)
  const cost      = qty * pru
  const curPrice  = latestPrice?.price ?? null
  const mv        = curPrice !== null ? qty * curPrice : null
  const pnl       = mv !== null ? mv - cost : null
  const pnlPct    = mv !== null && cost > 0 ? ((mv - cost) / cost) * 100 : null
  const currency  = position.currency as CurrencyCode

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <Link
          href="/portefeuille"
          className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-primary mb-3 transition-colors"
        >
          <ArrowLeft size={12} /> Retour au portefeuille
        </Link>
        <PageHeader
          title={instrument.name}
          subtitle={
            <span className="flex items-center gap-2 flex-wrap">
              <Badge variant="muted">{ASSET_CLASS_LABELS[instrument.asset_class] ?? instrument.asset_class}</Badge>
              {instrument.ticker && <span className="text-xs text-muted">{instrument.ticker}</span>}
              {instrument.isin && <span className="text-xs text-muted">· ISIN {instrument.isin}</span>}
              {envelope && <span className="text-xs text-secondary">· {envelope.name}</span>}
              {position.status !== 'active' && (
                <Badge variant="muted">{position.status}</Badge>
              )}
            </span>
          }
        />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
            <Hash size={11} /> Quantité
          </p>
          <p className="text-xl font-semibold financial-value text-primary mt-2">
            {formatQuantity(qty, 8)}
          </p>
          <p className="text-xs text-secondary mt-1">PRU {formatCurrency(pru, currency, { decimals: 2 })}</p>
        </div>

        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
            <Wallet size={11} /> Valeur de marché
          </p>
          <p className="text-xl font-semibold financial-value text-primary mt-2">
            {mv !== null ? formatCurrency(mv, currency, { compact: true }) : <span className="text-muted">—</span>}
          </p>
          <p className="text-xs text-secondary mt-1">
            {curPrice !== null
              ? <>prix {formatCurrency(curPrice, currency, { decimals: 2 })}</>
              : 'aucun prix'}
          </p>
        </div>

        <div className="card p-5 border-accent/20">
          <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
            <TrendingUp size={11} /> Plus-value latente
          </p>
          {pnl === null ? (
            <>
              <p className="text-xl font-semibold financial-value text-muted mt-2">—</p>
              <p className="text-xs text-secondary mt-1">en attente de prix</p>
            </>
          ) : (
            <>
              <p className={`text-xl font-semibold financial-value mt-2 ${pnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(pnl, currency, { compact: true, sign: true })}
              </p>
              <p className={`text-xs mt-1 ${pnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                {pnlPct !== null ? formatPercent(pnlPct, { sign: true }) : '—'}
              </p>
            </>
          )}
        </div>

        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
            <Activity size={11} /> Dernière cotation
          </p>
          <p className="text-xl font-semibold financial-value text-primary mt-2">
            {latestPrice
              ? new Date(latestPrice.priced_at).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: '2-digit',
                })
              : <span className="text-muted">—</span>}
          </p>
          <p className="text-xs text-secondary mt-1">
            {latestPrice ? `source : ${latestPrice.source}` : 'aucun prix enregistré'}
          </p>
        </div>
      </div>

      {/* ── Courbe historique des prix ────────────────────────────── */}
      <div className="card p-5 mb-6">
        <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1 mb-4">
          <LineChartIcon size={11} /> Historique du prix
          <span className="text-muted normal-case font-normal ml-2">
            · {priceHistory.length} point{priceHistory.length > 1 ? 's' : ''}
          </span>
        </p>
        <PriceHistoryChart data={priceHistory} currency={currency} />
      </div>

      {/* ── Métadonnées instrument ────────────────────────────────── */}
      {(instrument.sector || instrument.geography || instrument.asset_subclass) && (
        <div className="card p-5 mb-6">
          <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1 mb-3">
            <Globe size={11} /> Caractéristiques de l&apos;instrument
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {instrument.asset_subclass && (
              <div>
                <p className="text-xs text-secondary">Sous-classe</p>
                <p className="text-primary mt-0.5">{instrument.asset_subclass}</p>
              </div>
            )}
            {instrument.sector && (
              <div>
                <p className="text-xs text-secondary">Secteur</p>
                <p className="text-primary mt-0.5">{instrument.sector}</p>
              </div>
            )}
            {instrument.geography && (
              <div>
                <p className="text-xs text-secondary">Géographie</p>
                <p className="text-primary mt-0.5">{instrument.geography}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transactions liées ────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Receipt size={13} className="text-secondary" />
          <p className="text-xs text-secondary uppercase tracking-widest">
            Transactions liées
            <span className="text-muted normal-case font-normal ml-2">
              · {txRows?.length ?? 0}
            </span>
          </p>
        </div>
        {(!txRows || txRows.length === 0) ? (
          <EmptyState
            icon={Receipt}
            title="Aucune transaction enregistrée"
            description="Les achats / ventes / dividendes liés à cette position apparaîtront ici."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b border-border">
                <tr className="text-xs text-secondary uppercase tracking-wider">
                  <th className="text-left  px-4 py-3 font-medium">Date</th>
                  <th className="text-left  px-4 py-3 font-medium">Type</th>
                  <th className="text-right px-4 py-3 font-medium">Quantité</th>
                  <th className="text-right px-4 py-3 font-medium">Prix unitaire</th>
                  <th className="text-right px-4 py-3 font-medium">Frais</th>
                  <th className="text-right px-4 py-3 font-medium">Montant</th>
                  <th className="text-left  px-4 py-3 font-medium">Libellé</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-secondary">{formatDate(t.executed_at, 'short')}</td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{t.transaction_type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right financial-value text-secondary">
                      {t.quantity !== null && t.quantity !== undefined
                        ? formatQuantity(Number(t.quantity), 8)
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right financial-value text-secondary">
                      {t.unit_price !== null && t.unit_price !== undefined
                        ? formatCurrency(Number(t.unit_price), currency, { decimals: 2 })
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right financial-value text-muted text-xs">
                      {t.fees && Number(t.fees) > 0
                        ? formatCurrency(Number(t.fees), currency, { decimals: 2 })
                        : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right financial-value font-medium ${Number(t.amount) >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {formatCurrency(Number(t.amount), currency, { decimals: 2, sign: true })}
                    </td>
                    <td className="px-4 py-3 text-xs text-secondary truncate max-w-xs">
                      {t.label ?? <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
