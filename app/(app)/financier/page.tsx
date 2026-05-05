import { Metadata } from 'next'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }        from '@/components/shared/page-header'
import { EmptyState }        from '@/components/ui/empty-state'
import { Badge }             from '@/components/ui/badge'
import { FinancierActions }  from '@/components/pages/financier-actions'
import { FinancialAssetEditRow } from '@/components/pages/financial-asset-edit-row'
import { formatCurrency, formatPercent, ASSET_TYPE_LABELS } from '@/lib/utils/format'
import type { FinancialEnvelope } from '@/types/database.types'

export const metadata: Metadata = { title: 'Actifs financiers' }

const ENVELOPE_LABELS: Record<string, string> = {
  pea: 'PEA', cto: 'CTO', assurance_vie: 'Assurance Vie',
  per: 'PER', wallet_crypto: 'Wallet Crypto', other: 'Autre',
}

export default async function FinancierPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: envelopes } = await supabase
    .from('financial_envelopes')
    .select(`
      id, name, envelope_type, broker, is_active, user_id,
      opening_date, created_at, updated_at, currency, notes,
      financial_assets (
        id, name, ticker, isin, quantity, average_price, current_price, currency,
        acquisition_date, notes, envelope_id,
        asset:assets!asset_id ( asset_type, status )
      )
    `)
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('envelope_type')

  const totalValue = (envelopes ?? []).reduce((s, env) =>
    s + (env.financial_assets ?? []).reduce((ss: number, fa: { quantity: number; current_price: number | null; average_price: number }) =>
      ss + fa.quantity * (fa.current_price ?? fa.average_price), 0), 0)

  return (
    <div>
      <PageHeader
        title="Actifs financiers"
        subtitle={envelopes?.length ? `${envelopes.length} enveloppe${envelopes.length > 1 ? 's' : ''} · ${formatCurrency(totalValue, 'EUR', { compact: true })}` : undefined}
        action={<FinancierActions envelopes={(envelopes ?? []) as unknown as FinancialEnvelope[]} />}
      />

      {!envelopes?.length ? (
        <EmptyState
          icon={TrendingUp}
          title="Aucun actif financier"
          description="Ajoutez vos actions, ETF, crypto et or organisés par enveloppe fiscale."
          action={<FinancierActions envelopes={[]} />}
        />
      ) : (
        <div className="space-y-6">
          {envelopes.map((env) => {
            const fas      = env.financial_assets ?? []
            const envValue = fas.reduce((s: number, fa: { quantity: number; current_price: number | null; average_price: number }) =>
              s + fa.quantity * (fa.current_price ?? fa.average_price), 0)
            const envCost  = fas.reduce((s: number, fa: { quantity: number; average_price: number }) =>
              s + fa.quantity * fa.average_price, 0)
            const envPnL   = envValue - envCost
            const envPnLPct = envCost > 0 ? (envPnL / envCost) * 100 : 0

            return (
              <div key={env.id} className="card overflow-hidden">
                {/* En-tête enveloppe */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-medium text-primary">{env.name}</h2>
                        <Badge variant="muted">{ENVELOPE_LABELS[env.envelope_type] ?? env.envelope_type}</Badge>
                        {env.broker && <span className="text-xs text-secondary">{env.broker}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm financial-value font-medium text-primary">
                      {formatCurrency(envValue, 'EUR', { compact: true })}
                    </p>
                    <p className={`text-xs financial-value flex items-center gap-0.5 justify-end mt-0.5 ${envPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {envPnL >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {formatCurrency(envPnL, 'EUR', { compact: true, sign: true })}
                      <span className="text-secondary ml-1">({formatPercent(envPnLPct, { sign: true })})</span>
                    </p>
                  </div>
                </div>

                {/* Lignes de portefeuille */}
                {!fas.length ? (
                  <p className="px-5 py-4 text-sm text-secondary">Aucun actif dans cette enveloppe.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {fas.map((fa: {
                      id: string; name: string; ticker: string | null; isin: string | null;
                      quantity: number; average_price: number; current_price: number | null;
                      acquisition_date: string | null; notes: string | null; envelope_id: string | null;
                      asset: { asset_type: string; status: string }[] | { asset_type: string; status: string } | null
                    }) => {
                      const price      = fa.current_price ?? fa.average_price
                      const value      = fa.quantity * price
                      const cost       = fa.quantity * fa.average_price
                      const pnl        = value - cost
                      const pnlPct     = cost > 0 ? (pnl / cost) * 100 : 0
                      const isPositive = pnl >= 0
                      const faAsset    = Array.isArray(fa.asset) ? (fa.asset[0] ?? null) : fa.asset

                      return (
                        <FinancialAssetEditRow key={fa.id} fa={fa} envelopes={envelopes as unknown as FinancialEnvelope[]}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary font-medium truncate">{fa.name}</p>
                            <p className="text-xs text-secondary">
                              {fa.ticker && <span className="font-mono">{fa.ticker} · </span>}
                              {fa.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} unités
                              · PRU {formatCurrency(fa.average_price)}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm financial-value text-primary">
                              {formatCurrency(value, 'EUR', { compact: true })}
                            </p>
                            <p className={`text-xs financial-value ${isPositive ? 'text-accent' : 'text-danger'}`}>
                              {formatCurrency(pnl, 'EUR', { sign: true })} ({formatPercent(pnlPct, { sign: true })})
                            </p>
                          </div>
                          <Badge variant="muted">
                            {ASSET_TYPE_LABELS[faAsset?.asset_type ?? 'other'] ?? 'Autre'}
                          </Badge>
                        </FinancialAssetEditRow>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
