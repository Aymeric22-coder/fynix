import { Metadata } from 'next'
import { ArrowLeftRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }             from '@/components/shared/page-header'
import { EmptyState }             from '@/components/ui/empty-state'
import { Badge }                  from '@/components/ui/badge'
import { TransactionActions }     from '@/components/pages/transaction-actions'
import { TransactionEditButton }  from '@/components/pages/transaction-edit-button'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Transactions' }

const TX_CONFIG: Record<string, { label: string; positive: boolean }> = {
  purchase:    { label: 'Achat',       positive: false },
  sale:        { label: 'Vente',       positive: true  },
  rent_income: { label: 'Loyer',       positive: true  },
  dividend:    { label: 'Dividende',   positive: true  },
  interest:    { label: 'Intérêt',     positive: true  },
  loan_payment:{ label: 'Remb. crédit',positive: false },
  deposit:     { label: 'Apport',      positive: true  },
  withdrawal:  { label: 'Retrait',     positive: false },
  fee:         { label: 'Frais',       positive: false },
  tax:         { label: 'Impôt',       positive: false },
  transfer:    { label: 'Virement',    positive: false },
}

export default async function TransactionsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: txs, count } = await supabase
    .from('transactions')
    .select(`
      id, transaction_type, amount, currency, executed_at, label, data_source,
      quantity, unit_price, notes,
      asset:assets ( name, asset_type )
    `, { count: 'exact' })
    .eq('user_id', user!.id)
    .order('executed_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <PageHeader
        title="Journal des transactions"
        subtitle={count ? `${count} opération${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''}` : undefined}
        action={<TransactionActions />}
      />

      {!txs?.length ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Aucune transaction"
          description="Toutes vos opérations financières (achats, loyers, dividendes, crédits) apparaissent ici."
          action={<TransactionActions />}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border">
            {txs.map((tx) => {
              const config   = TX_CONFIG[tx.transaction_type] ?? { label: tx.transaction_type, positive: tx.amount > 0 }
              const isPositive = tx.amount > 0

              return (
                <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 transition-colors">
                  {/* Icône direction */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isPositive ? 'bg-accent-muted text-accent' : 'bg-danger-muted text-danger'
                  }`}>
                    {isPositive
                      ? <ArrowDownLeft size={14} />
                      : <ArrowUpRight  size={14} />
                    }
                  </div>

                  {/* Label + actif */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary truncate">
                      {tx.label || config.label}
                    </p>
                    <p className="text-xs text-secondary">
                      {(() => { const a = Array.isArray(tx.asset) ? tx.asset[0] : tx.asset; return a?.name ? <span>{a.name} · </span> : null })()}
                      {formatDate(tx.executed_at, 'medium')}
                    </p>
                  </div>

                  {/* Type */}
                  <Badge variant="muted" className="hidden sm:inline-flex flex-shrink-0">
                    {config.label}
                  </Badge>

                  {/* Modifier */}
                  <TransactionEditButton tx={tx} />

                  {/* Montant */}
                  <p className={`text-sm financial-value font-medium flex-shrink-0 ${
                    isPositive ? 'text-accent' : 'text-primary'
                  }`}>
                    {isPositive ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                  </p>
                </div>
              )
            })}
          </div>

          {count && count > 50 && (
            <div className="px-5 py-3 border-t border-border text-xs text-secondary text-center">
              Affichage des 50 dernières opérations sur {count}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
