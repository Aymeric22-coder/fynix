import { Metadata } from 'next'
import { Briefcase, Wallet, TrendingUp, Activity, Layers } from 'lucide-react'
import { createServerClient }     from '@/lib/supabase/server'
import { PageHeader }             from '@/components/shared/page-header'
import { EmptyState }             from '@/components/ui/empty-state'
import { Badge }                  from '@/components/ui/badge'
import { buildPortfolioFromDb }   from '@/lib/portfolio/build-from-db'
import {
  formatCurrency, formatPercent, formatQuantity, formatDate,
  ASSET_CLASS_LABELS,
} from '@/lib/utils/format'
import { PortefeuilleActions }    from '@/components/pages/portefeuille-actions'

export const metadata: Metadata = { title: 'Portefeuille' }

export default async function PortefeuillePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Charge envelopes pour le formulaire d'ajout
  const { data: envelopes } = await supabase
    .from('financial_envelopes')
    .select('id, name, envelope_type, broker')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('name')

  // Compute portfolio
  const result = await buildPortfolioFromDb(supabase, user!.id)
  const { positions, summary } = result

  return (
    <div>
      <PageHeader
        title="Portefeuille"
        subtitle={
          summary.positionsCount > 0
            ? `${summary.positionsCount} position${summary.positionsCount > 1 ? 's' : ''} active${summary.positionsCount > 1 ? 's' : ''}`
            : 'Suivi unifié actions, ETF, crypto, SCPI'
        }
        action={<PortefeuilleActions envelopes={envelopes ?? []} />}
      />

      {summary.positionsCount === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Aucune position"
          description="Ajoutez votre première position (action, ETF, crypto, SCPI…) pour démarrer le suivi unifié."
          action={<PortefeuilleActions envelopes={envelopes ?? []} />}
        />
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <Wallet size={11} /> Valeur de marché
              </p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(summary.totalMarketValue, summary.referenceCurrency, { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">
                {summary.positionsCount} position{summary.positionsCount > 1 ? 's' : ''}
              </p>
            </div>

            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Cost basis</p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(summary.totalCostBasis, summary.referenceCurrency, { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">capital investi</p>
            </div>

            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <TrendingUp size={11} /> Plus-value latente
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${summary.totalUnrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(summary.totalUnrealizedPnL, summary.referenceCurrency, { compact: true, sign: true })}
              </p>
              <p className={`text-xs mt-1 ${summary.totalUnrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatPercent(summary.totalUnrealizedPnLPct, { sign: true })}
              </p>
            </div>

            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <Activity size={11} /> Fraîcheur prix
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${summary.freshnessRatio >= 0.8 ? 'text-accent' : summary.freshnessRatio >= 0.5 ? 'text-warning' : 'text-danger'}`}>
                {formatPercent(summary.freshnessRatio * 100, { decimals: 0 })}
              </p>
              <p className="text-xs text-secondary mt-1">{`< 24 h`}</p>
            </div>
          </div>

          {/* ── Allocations ──────────────────────────────────────────────── */}
          {summary.allocationByClass.length > 0 && (
            <div className="card p-5 mb-6">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1 mb-4">
                <Layers size={11} /> Allocation par classe d&apos;actif
              </p>
              <div className="space-y-2">
                {summary.allocationByClass.map((slice) => (
                  <div key={slice.assetClass} className="flex items-center gap-3">
                    <div className="text-xs text-secondary w-32 flex-shrink-0">
                      {ASSET_CLASS_LABELS[slice.assetClass] ?? slice.assetClass}
                    </div>
                    <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${slice.weightPct}%` }}
                      />
                    </div>
                    <div className="text-xs text-primary w-16 text-right financial-value">
                      {formatPercent(slice.weightPct, { decimals: 1 })}
                    </div>
                    <div className="text-xs text-secondary w-24 text-right financial-value">
                      {formatCurrency(slice.value, summary.referenceCurrency, { compact: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tableau positions ────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 border-b border-border">
                  <tr className="text-xs text-secondary uppercase tracking-wider">
                    <th className="text-left  px-4 py-3 font-medium">Position</th>
                    <th className="text-left  px-4 py-3 font-medium">Classe</th>
                    <th className="text-right px-4 py-3 font-medium">Quantité</th>
                    <th className="text-right px-4 py-3 font-medium">PRU</th>
                    <th className="text-right px-4 py-3 font-medium">Prix actuel</th>
                    <th className="text-right px-4 py-3 font-medium">Valeur</th>
                    <th className="text-right px-4 py-3 font-medium">+/− latente</th>
                    <th className="text-right px-4 py-3 font-medium">Fraîcheur</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.positionId} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-primary">{p.name}</div>
                        {p.ticker && (
                          <div className="text-xs text-muted">{p.ticker}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="muted">{ASSET_CLASS_LABELS[p.assetClass] ?? p.assetClass}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right financial-value">
                        {formatQuantity(p.quantity, 8)}
                      </td>
                      <td className="px-4 py-3 text-right financial-value text-secondary">
                        {formatCurrency(p.averagePrice, p.currency)}
                      </td>
                      <td className="px-4 py-3 text-right financial-value">
                        {p.currentPrice !== null ? formatCurrency(p.currentPrice, p.currency) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right financial-value font-medium text-primary">
                        {p.marketValue !== null ? formatCurrency(p.marketValue, p.currency, { compact: true }) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.unrealizedPnL !== null ? (
                          <div>
                            <div className={`financial-value font-medium ${p.unrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                              {formatCurrency(p.unrealizedPnL, p.currency, { compact: true, sign: true })}
                            </div>
                            {p.unrealizedPnLPct !== null && (
                              <div className={`text-xs ${p.unrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                                {formatPercent(p.unrealizedPnLPct, { sign: true })}
                              </div>
                            )}
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.priceFreshAt ? (
                          <div className={`text-xs ${p.priceStale ? 'text-warning' : 'text-secondary'}`}>
                            {formatDate(p.priceFreshAt, 'short')}
                          </div>
                        ) : <span className="text-muted text-xs">jamais</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
