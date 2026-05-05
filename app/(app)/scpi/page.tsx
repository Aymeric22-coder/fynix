import { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }      from '@/components/shared/page-header'
import { EmptyState }      from '@/components/ui/empty-state'
import { Badge }           from '@/components/ui/badge'
import { ScpiActions }     from '@/components/pages/scpi-actions'
import { ScpiEditButton }  from '@/components/pages/scpi-edit-button'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'SCPI' }

const HOLDING_LABELS: Record<string, string> = {
  direct: 'Direct', assurance_vie: 'Assurance Vie', sci: 'SCI', other: 'Autre',
}

export default async function ScpiPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: scpis } = await supabase
    .from('scpi_assets')
    .select(`
      *,
      asset:assets!asset_id ( name, acquisition_date, current_value ),
      dividends:scpi_dividends ( amount, payment_date )
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  const totalValue = (scpis ?? []).reduce((s, scpi) => {
    const withdrawalPrice = scpi.withdrawal_price ?? scpi.current_share_price ?? 0
    return s + withdrawalPrice * scpi.nb_shares
  }, 0)

  const totalInvested = (scpis ?? []).reduce((s, scpi) =>
    s + (scpi.subscription_price ?? 0) * scpi.nb_shares, 0)

  return (
    <div>
      <PageHeader
        title="SCPI"
        subtitle={scpis?.length ? `${scpis.length} SCPI · ${formatCurrency(totalValue, 'EUR', { compact: true })}` : undefined}
        action={<ScpiActions />}
      />

      {!scpis?.length ? (
        <EmptyState
          icon={FileText}
          title="Aucune SCPI"
          description="Ajoutez vos parts de SCPI pour suivre valorisation et dividendes."
          action={<ScpiActions />}
        />
      ) : (
        <>
          {/* Récap global */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Valeur totale',   value: formatCurrency(totalValue, 'EUR', { compact: true }) },
              { label: 'Investi total',   value: formatCurrency(totalInvested, 'EUR', { compact: true }) },
              { label: 'PV latente',      value: formatCurrency(totalValue - totalInvested, 'EUR', { compact: true, sign: true }) },
            ].map(kpi => (
              <div key={kpi.label} className="card p-4">
                <p className="text-xs text-secondary uppercase tracking-widest">{kpi.label}</p>
                <p className="text-xl font-semibold financial-value text-primary mt-2">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Liste */}
          <div className="space-y-3">
            {scpis.map((scpi) => {
              const withdrawalPrice = scpi.withdrawal_price ?? scpi.current_share_price ?? 0
              const currentValue    = withdrawalPrice * scpi.nb_shares
              const invested        = (scpi.subscription_price ?? 0) * scpi.nb_shares
              const latentGain      = currentValue - invested
              const latentPct       = invested > 0 ? (latentGain / invested) * 100 : 0
              const totalDividends  = (scpi.dividends ?? []).reduce((s: number, d: { amount: number }) => s + d.amount, 0)
              const lastDiv         = (scpi.dividends ?? [])[0]

              return (
                <div key={scpi.id} className="card p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-medium text-primary">{scpi.scpi_name}</h3>
                      <p className="text-xs text-secondary mt-0.5">{scpi.nb_shares.toLocaleString('fr-FR')} parts</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">{HOLDING_LABELS[scpi.holding_mode] ?? scpi.holding_mode}</Badge>
                      {scpi.distribution_rate && (
                        <Badge variant="success">{formatPercent(scpi.distribution_rate)} TDVM</Badge>
                      )}
                      <ScpiEditButton scpi={scpi} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-secondary">Valeur retrait</p>
                      <p className="text-sm financial-value text-primary mt-0.5">
                        {formatCurrency(currentValue, 'EUR', { compact: true })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Prix / part</p>
                      <p className="text-sm financial-value text-primary mt-0.5">
                        {withdrawalPrice > 0 ? formatCurrency(withdrawalPrice, 'EUR') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">PV latente</p>
                      <p className={`text-sm financial-value mt-0.5 ${latentGain >= 0 ? 'text-accent' : 'text-danger'}`}>
                        {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
                        <span className="text-xs ml-1">({formatPercent(latentPct, { sign: true })})</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Dividendes totaux</p>
                      <p className="text-sm financial-value text-accent mt-0.5">
                        {totalDividends > 0 ? formatCurrency(totalDividends, 'EUR') : '—'}
                      </p>
                      {lastDiv && (
                        <p className="text-xs text-secondary">{formatDate(lastDiv.payment_date, 'medium')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
