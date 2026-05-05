import { Metadata } from 'next'
import { PiggyBank } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }   from '@/components/shared/page-header'
import { EmptyState }   from '@/components/ui/empty-state'
import { Badge }        from '@/components/ui/badge'
import { CashActions }  from '@/components/pages/cash-actions'
import { CashEditRow }  from '@/components/pages/cash-edit-row'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Cash & Épargne' }

const ACCOUNT_LABELS: Record<string, string> = {
  livret_a: 'Livret A', ldds: 'LDDS', lep: 'LEP',
  livret_jeune: 'Livret Jeune', pel: 'PEL', cel: 'CEL',
  compte_courant: 'Compte courant', compte_epargne: 'Compte épargne', other: 'Autre',
}

export default async function CashPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('cash_accounts')
    .select(`
      *,
      asset:assets!asset_id ( name, status )
    `)
    .eq('user_id', user!.id)
    .order('account_type')

  const total = (accounts ?? []).reduce((s, a) => s + a.balance, 0)

  return (
    <div>
      <PageHeader
        title="Cash & Épargne"
        subtitle={accounts?.length ? `${accounts.length} compte${accounts.length > 1 ? 's' : ''} · ${formatCurrency(total, 'EUR', { compact: true })}` : undefined}
        action={<CashActions />}
      />

      {!accounts?.length ? (
        <EmptyState
          icon={PiggyBank}
          title="Aucun compte"
          description="Ajoutez vos livrets et comptes courants pour centraliser votre cash."
          action={<CashActions />}
        />
      ) : (
        <>
          {/* Total */}
          <div className="card p-5 border-accent/20 mb-6">
            <p className="text-xs text-secondary uppercase tracking-widest">Total disponible</p>
            <p className="text-3xl font-semibold financial-value text-accent mt-2">
              {formatCurrency(total, 'EUR', { compact: true })}
            </p>
          </div>

          <div className="space-y-3">
            {accounts.map((account) => {
              const annualInterest = account.balance * (account.interest_rate / 100)
              return (
                <CashEditRow key={account.id} account={account}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-primary">{account.asset?.name}</h3>
                      <Badge variant="muted">{ACCOUNT_LABELS[account.account_type] ?? account.account_type}</Badge>
                    </div>
                    <p className="text-xs text-secondary">
                      {account.bank_name && `${account.bank_name} · `}
                      Mis à jour {formatDate(account.balance_date, 'medium')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg financial-value font-semibold text-primary">
                      {formatCurrency(account.balance, 'EUR')}
                    </p>
                    {account.interest_rate > 0 && (
                      <p className="text-xs text-accent mt-0.5">
                        {formatPercent(account.interest_rate)} · {formatCurrency(annualInterest, 'EUR')} / an
                      </p>
                    )}
                  </div>
                </CashEditRow>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
