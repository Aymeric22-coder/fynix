import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wallet, TrendingUp, Activity, LineChart as LineChartIcon,
  Receipt, Hash, Globe, Clock, Coins,
} from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PriceHistoryChart, type PricePoint } from '@/components/portfolio/price-history-chart'
import { AddPriceModalTrigger } from '@/components/portfolio/add-price-modal'
import { PositionTransactionActions } from '@/components/portfolio/position-transaction-actions'
import { TransactionsList, type TxRow } from '@/components/portfolio/transactions-list'
import { CsvExportButton } from '@/components/portfolio/csv-export-button'
import { slugify, type TransactionCsvRow } from '@/lib/portfolio/export-csv'
import type { TransactionType } from '@/components/portfolio/add-transaction-modal'
import {
  computePositionDividendMetrics,
  type DividendTx,
} from '@/lib/portfolio/dividends'
import { projectDividends } from '@/lib/portfolio/dividend-calendar'
import {
  formatCurrency, formatPercent, formatQuantity, formatDate,
  ASSET_CLASS_LABELS,
} from '@/lib/utils/format'
import {
  FREQUENCY_LABELS, nextValuationDue, valuationStatus,
} from '@/lib/portfolio/freshness'
import type { AssetClass, CurrencyCode, ValuationFrequency } from '@/types/database.types'

export const metadata: Metadata = { title: 'Détail position' }

type Props = {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}

export default async function PositionDetailPage({ params, searchParams }: Props) {
  const { id }         = await params
  const { type: typeQ } = await searchParams
  // Pre-selection du type de transaction via query param (?type=sell|buy|dividend).
  // Tout autre valeur est ignoree silencieusement.
  const defaultTxType: TransactionType | undefined =
    typeQ === 'sell' || typeQ === 'buy' || typeQ === 'dividend' ? typeQ : undefined
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Position + instrument + enveloppe ──────────────────────────────
  const { data: position } = await supabase
    .from('positions')
    .select(`
      id, instrument_id, envelope_id, quantity, average_price, currency,
      broker, acquisition_date, notes, status, created_at,
      instrument:instruments!instrument_id (*),
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
    valuation_frequency?: ValuationFrequency | null
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
    .select('id, transaction_type, amount, quantity, unit_price, fees, executed_at, label, notes, position_id, currency, realized_pnl')
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

  // ── Lignes d'export CSV des transactions liées (Sprint 4) ─────────────
  const transactionsCsvRows: TransactionCsvRow[] = (txRows ?? []).map((t) => ({
    executedAt:      String(t.executed_at),
    transactionType: String(t.transaction_type),
    quantity:        t.quantity   != null ? Number(t.quantity)   : null,
    unitPrice:       t.unit_price != null ? Number(t.unit_price) : null,
    fees:            t.fees       != null ? Number(t.fees)       : null,
    amount:          t.amount     != null ? Number(t.amount)     : null,
    currency:        (t.currency as string | null) ?? currency,
    label:           (t.label as string | null) ?? null,
    realizedPnl:     t.realized_pnl != null ? Number(t.realized_pnl) : null,
  }))

  // ── Dividendes (E3) ──────────────────────────────────────────────────
  const dividendTxs: DividendTx[] = (txRows ?? [])
    .filter((t) => t.transaction_type === 'dividend')
    .map((t) => ({
      position_id:  String(position.id),
      amount:       Number(t.amount),
      currency,
      executed_at:  String(t.executed_at),
    }))

  const dividendMetrics = computePositionDividendMetrics(
    dividendTxs,
    { positionId: String(position.id), costBasis: cost, marketValue: mv, currency },
  )

  // ── Projection / frequence (DCAL) ──
  // On reutilise `projectDividends` localement avec les dividendes de la
  // position courante. Pas de conversion FX necessaire ici : on reste dans
  // la devise de la position, cohérent avec le reste du bloc Dividendes.
  const positionProjections = projectDividends({
    positions: [{ id: String(position.id), ticker: instrument.ticker ?? '' }],
    dividendsByPosition: {
      [String(position.id)]: dividendTxs.map((t) => ({
        date:      t.executed_at.slice(0, 10),
        amountRef: t.amount,  // meme devise que `currency` ci-dessus
      })),
    },
  })
  const projection = positionProjections[0] ?? null
  const FREQUENCY_LABELS_DCAL: Record<string, string> = {
    monthly:       'Mensuelle',
    quarterly:     'Trimestrielle',
    'semi-annual': 'Semestrielle',
    annual:        'Annuelle',
    unknown:       'Irrégulière',
  }

  // ── Cadence de valorisation ─────────────────────────────────────────
  const freq      = (instrument.valuation_frequency ?? 'daily') as ValuationFrequency
  const lastDate  = latestPrice?.priced_at ?? null
  const dueDate   = lastDate ? nextValuationDue(lastDate, freq) : null
  const status    = valuationStatus(lastDate, freq)

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
        <div className="flex items-start justify-between gap-3 flex-wrap">
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
          <div className="pt-1 flex items-center gap-2">
            <PositionTransactionActions
              position={{
                id:            String(position.id),
                ticker:        instrument.ticker ?? '',
                name:          instrument.name,
                envelopeLabel: envelope?.name ?? '',
                currentQty:    qty,
                averagePrice:  pru,
                currency,
              }}
              defaultType={defaultTxType}
            />
            <AddPriceModalTrigger
              positionId={position.id}
              positionName={instrument.name}
              quantity={qty}
              currency={currency}
              lastPrice={curPrice}
              lastDate={lastDate}
            />
          </div>
        </div>
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

      {/* ── Cadence de valorisation ───────────────────────────────── */}
      <div className="card p-4 mb-6 flex items-center gap-3 flex-wrap text-sm">
        <Clock size={14} className="text-secondary" />
        <span className="text-xs text-secondary uppercase tracking-widest">Cadence</span>
        <span className="text-primary">{FREQUENCY_LABELS[freq]}</span>
        {dueDate && (
          <>
            <span className="text-muted">·</span>
            <span className="text-xs text-secondary">prochaine valeur attendue</span>
            <span className="text-primary financial-value">
              {dueDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </>
        )}
        {status === 'on_time' && (
          <Badge variant="success" className="ml-auto">À jour</Badge>
        )}
        {status === 'due' && (
          <Badge variant="warning" className="ml-auto">À mettre à jour</Badge>
        )}
        {status === 'overdue' && (
          <Badge variant="danger" className="ml-auto">En retard</Badge>
        )}
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

      {/* ── Dividendes (E3 + DCAL) ──────────────────────────────────── */}
      <div className="card p-5 mb-6">
        <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1 mb-4">
          <Coins size={11} /> Dividendes
          <span className="text-muted normal-case font-normal ml-2">
            · {dividendTxs.length} versement{dividendTxs.length > 1 ? 's' : ''} enregistré{dividendTxs.length > 1 ? 's' : ''}
          </span>
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-secondary">12 mois glissants</p>
            <p className="text-base font-semibold financial-value text-accent mt-1">
              {formatCurrency(dividendMetrics.ttmTotal, currency, { decimals: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary">Yield on Cost</p>
            <p className="text-base font-semibold financial-value text-primary mt-1">
              {dividendMetrics.yieldOnCost !== null
                ? formatPercent(dividendMetrics.yieldOnCost, { decimals: 2 })
                : <span className="text-muted">—</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary">Yield on Market</p>
            <p className="text-base font-semibold financial-value text-primary mt-1">
              {dividendMetrics.yieldOnMarket !== null
                ? formatPercent(dividendMetrics.yieldOnMarket, { decimals: 2 })
                : <span className="text-muted">—</span>}
            </p>
          </div>
        </div>

        {/* Projection annuelle (DCAL) — visible uniquement quand on a une
            frequence detectee. Une seule date TTM = unknown → on cache. */}
        {projection && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-secondary">Fréquence détectée</p>
              <p className="text-base font-semibold text-primary mt-1">
                {FREQUENCY_LABELS_DCAL[projection.frequency] ?? projection.frequency}
                {projection.confidenceLevel === 'low' && (
                  <span className="text-[10px] text-muted ml-2">basse confiance</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-secondary">Projection annuelle</p>
              <p className="text-base font-semibold financial-value text-accent mt-1">
                {projection.frequency === 'unknown'
                  ? <span className="text-muted">—</span>
                  : formatCurrency(projection.annualProjectionRef, currency, { decimals: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-secondary">Prochain versement attendu</p>
              <p className="text-base font-semibold text-primary mt-1">
                {projection.nextExpectedDate
                  ? formatDate(projection.nextExpectedDate)
                  : <span className="text-muted">—</span>}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Transactions liées ────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt size={13} className="text-secondary" />
            <p className="text-xs text-secondary uppercase tracking-widest">
              Transactions liées
              <span className="text-muted normal-case font-normal ml-2">
                · {txRows?.length ?? 0}
              </span>
            </p>
          </div>
          {txRows && txRows.length > 0 && (
            <CsvExportButton
              kind="transactions"
              rows={transactionsCsvRows}
              filenamePrefix={`transactions-${slugify(instrument.name)}`}
              label="Exporter (CSV)"
            />
          )}
        </div>
        {(!txRows || txRows.length === 0) ? (
          <EmptyState
            icon={Receipt}
            title="Aucune transaction enregistrée"
            description="Les achats / ventes / dividendes liés à cette position apparaîtront ici."
          />
        ) : (
          <TransactionsList
            rows={(txRows as TxRow[])}
            positionId={String(position.id)}
            positionCurrency={currency}
            ticker={instrument.ticker ?? ''}
            name={instrument.name}
          />
        )}
      </div>
    </div>
  )
}
