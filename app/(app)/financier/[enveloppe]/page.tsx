import { Metadata } from 'next'
import { notFound }   from 'next/navigation'
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { Badge }         from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/shared/confidence-badge'
import { formatCurrency, formatPercent, formatDate, ASSET_TYPE_LABELS } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Enveloppe' }
type Props = { params: Promise<{ enveloppe: string }> }

const ENVELOPE_LABELS: Record<string, string> = {
  pea: 'PEA', cto: 'CTO', assurance_vie: 'Assurance Vie',
  per: 'PER', wallet_crypto: 'Wallet Crypto', other: 'Autre',
}

export default async function EnveloppeDetailPage({ params }: Props) {
  const { enveloppe: id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: env } = await supabase
    .from('financial_envelopes')
    .select(`
      *,
      financial_assets (
        id, name, ticker, isin, quantity, average_price, current_price,
        current_price_at, currency, data_source, confidence,
        asset:assets!asset_id ( asset_type, acquisition_date )
      )
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (!env) notFound()

  const fas      = env.financial_assets ?? []
  const envValue = fas.reduce((s: number, fa: { quantity: number; current_price: number | null; average_price: number }) =>
    s + fa.quantity * (fa.current_price ?? fa.average_price), 0)
  const envCost  = fas.reduce((s: number, fa: { quantity: number; average_price: number }) =>
    s + fa.quantity * fa.average_price, 0)
  const envPnL   = envValue - envCost
  const envPnLPct = envCost > 0 ? (envPnL / envCost) * 100 : 0

  return (
    <div className="space-y-8">
      {/* Navigation */}
      <Link href="/financier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour aux actifs financiers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-primary">{env.name}</h1>
            <Badge variant="muted">{ENVELOPE_LABELS[env.envelope_type] ?? env.envelope_type}</Badge>
          </div>
          {env.broker && <p className="text-sm text-secondary">{env.broker}</p>}
          {env.opening_date && (
            <p className="text-xs text-muted mt-1">Ouvert le {formatDate(env.opening_date, 'medium')}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold financial-value text-primary">
            {formatCurrency(envValue, 'EUR', { compact: true })}
          </p>
          <p className={`text-sm financial-value flex items-center gap-1 justify-end mt-1 ${envPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
            {envPnL >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {formatCurrency(envPnL, 'EUR', { compact: true, sign: true })}
            <span className="text-secondary">({formatPercent(envPnLPct, { sign: true })})</span>
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Valeur actuelle',   value: formatCurrency(envValue, 'EUR', { compact: true }), accent: true },
          { label: 'Montant investi',   value: formatCurrency(envCost,  'EUR', { compact: true }) },
          { label: 'Lignes en portefeuille', value: String(fas.length) + ' actif' + (fas.length > 1 ? 's' : '') },
        ].map((k) => (
          <div key={k.label} className={`card p-5 ${k.accent ? 'border-accent/20' : ''}`}>
            <p className="text-xs text-secondary uppercase tracking-widest">{k.label}</p>
            <p className="text-xl font-semibold financial-value text-primary mt-2">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Table des actifs */}
      {!fas.length ? (
        <p className="text-secondary text-sm text-center py-12">Aucun actif dans cette enveloppe.</p>
      ) : (
        <div className="card overflow-hidden">
          {/* Thead */}
          <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border text-xs text-secondary uppercase tracking-widest">
            <span>Actif</span>
            <span className="text-right">Quantité / PRU</span>
            <span className="text-right">Prix actuel</span>
            <span className="text-right">Valeur</span>
            <span className="text-right">P&amp;L</span>
          </div>

          <div className="divide-y divide-border">
            {fas.map((fa: {
              id: string; name: string; ticker: string | null; isin: string | null;
              quantity: number; average_price: number; current_price: number | null;
              current_price_at: string | null; currency: string; confidence: string;
              asset: { asset_type: string; acquisition_date: string | null } | null
            }) => {
              const price   = fa.current_price ?? fa.average_price
              const value   = fa.quantity * price
              const cost    = fa.quantity * fa.average_price
              const pnl     = value - cost
              const pnlPct  = cost > 0 ? (pnl / cost) * 100 : 0
              const weight  = envValue > 0 ? (value / envValue) * 100 : 0

              return (
                <div key={fa.id} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 sm:gap-4 px-5 py-4 hover:bg-surface-2 transition-colors">
                  {/* Actif */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-primary font-medium truncate">{fa.name}</p>
                      {fa.ticker && <span className="text-xs font-mono text-secondary bg-surface-2 px-1.5 py-0.5 rounded">{fa.ticker}</span>}
                      <ConfidenceBadge level={fa.confidence as 'high' | 'medium' | 'low'} />
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {ASSET_TYPE_LABELS[fa.asset?.asset_type ?? 'other']}
                      {fa.asset?.acquisition_date && ` · Acquis ${formatDate(fa.asset.acquisition_date, 'medium')}`}
                    </p>
                    {/* Barre de poids */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-1 w-20 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(weight, 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted">{formatPercent(weight, { decimals: 1 })}</span>
                    </div>
                  </div>

                  {/* Quantité / PRU */}
                  <div className="sm:text-right">
                    <p className="text-sm financial-value text-primary">
                      {fa.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 6 })}
                    </p>
                    <p className="text-xs text-secondary">PRU {formatCurrency(fa.average_price, fa.currency as 'EUR')}</p>
                  </div>

                  {/* Prix actuel */}
                  <div className="sm:text-right">
                    <p className="text-sm financial-value text-primary">{formatCurrency(price, fa.currency as 'EUR')}</p>
                    {fa.current_price_at && (
                      <p className="text-xs text-muted">{formatDate(fa.current_price_at, 'short')}</p>
                    )}
                  </div>

                  {/* Valeur */}
                  <div className="sm:text-right">
                    <p className="text-sm financial-value font-medium text-primary">
                      {formatCurrency(value, 'EUR', { compact: true })}
                    </p>
                  </div>

                  {/* P&L */}
                  <div className={`sm:text-right ${pnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                    <p className="text-sm financial-value font-medium">
                      {formatCurrency(pnl, 'EUR', { compact: true, sign: true })}
                    </p>
                    <p className="text-xs">{formatPercent(pnlPct, { sign: true })}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
