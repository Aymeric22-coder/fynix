import { Metadata } from 'next'
import { CreditCard } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }     from '@/components/shared/page-header'
import { EmptyState }     from '@/components/ui/empty-state'
import { Badge }          from '@/components/ui/badge'
import { DettesActions }  from '@/components/pages/dettes-actions'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Dettes & Crédits' }

const DEBT_LABELS: Record<string, string> = {
  mortgage: 'Immobilier', consumer: 'Consommation', professional: 'Professionnel',
}

export default async function DettesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: debts } = await supabase
    .from('debts')
    .select(`
      *,
      asset:assets ( name, asset_type )
    `)
    .eq('user_id', user!.id)
    .eq('status', 'active')
    .order('start_date', { ascending: false })

  const totalCapital  = (debts ?? []).reduce((s, d) => s + (d.capital_remaining ?? 0), 0)
  const totalMonthly  = (debts ?? []).reduce((s, d) => s + (d.monthly_payment ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Dettes & Crédits"
        subtitle={debts?.length ? `${debts.length} crédit${debts.length > 1 ? 's' : ''} actifs` : undefined}
        action={<DettesActions />}
      />

      {!debts?.length ? (
        <EmptyState
          icon={CreditCard}
          title="Aucun crédit actif"
          description="Ajoutez vos crédits pour suivre le capital restant dû et générer les tableaux d'amortissement."
          action={<DettesActions />}
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Capital restant dû total</p>
              <p className="text-2xl font-semibold financial-value text-danger mt-2">
                {formatCurrency(totalCapital, 'EUR', { compact: true })}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Mensualités totales</p>
              <p className="text-2xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(totalMonthly, 'EUR')} / mois
              </p>
            </div>
          </div>

          {/* Liste crédits */}
          <div className="space-y-4">
            {debts.map((debt) => {
              const startDate  = new Date(debt.start_date)
              const endDate    = new Date(startDate)
              endDate.setMonth(endDate.getMonth() + debt.duration_months)
              const now        = new Date()
              const elapsed    = Math.max(0, (now.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime()) * 100)
              const insuranceMontly = (debt.capital_remaining ?? 0) * (debt.insurance_rate / 100) / 12
              const totalMonthly   = (debt.monthly_payment ?? 0) + insuranceMontly

              return (
                <div key={debt.id} className="card p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-medium text-primary">{debt.name}</h3>
                      {debt.asset && <p className="text-xs text-secondary mt-0.5">{debt.asset.name}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">{DEBT_LABELS[debt.debt_type] ?? debt.debt_type}</Badge>
                      {debt.lender && <span className="text-xs text-secondary">{debt.lender}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-secondary">Capital restant</p>
                      <p className="text-sm financial-value text-danger font-medium mt-0.5">
                        {formatCurrency(debt.capital_remaining, 'EUR', { compact: true })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Mensualité</p>
                      <p className="text-sm financial-value text-primary font-medium mt-0.5">
                        {formatCurrency(totalMonthly, 'EUR')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Taux</p>
                      <p className="text-sm financial-value text-primary mt-0.5">
                        {formatPercent(debt.interest_rate)}
                        {debt.insurance_rate > 0 && <span className="text-secondary text-xs"> + {formatPercent(debt.insurance_rate)} ass.</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-secondary">Fin prévue</p>
                      <p className="text-sm financial-value text-primary mt-0.5">
                        {formatDate(endDate.toISOString(), 'medium')}
                      </p>
                    </div>
                  </div>

                  {/* Barre d'avancement */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-secondary">
                      <span>{formatDate(debt.start_date, 'medium')}</span>
                      <span>{elapsed.toFixed(0)} % remboursé</span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${Math.min(elapsed, 100)}%` }}
                      />
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
