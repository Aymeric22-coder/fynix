import { Metadata } from 'next'
import { RefreshCw, CheckCircle2, Clock, SkipForward } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }          from '@/components/shared/page-header'
import { EmptyState }          from '@/components/ui/empty-state'
import { Badge }               from '@/components/ui/badge'
import { DcaActions }          from '@/components/pages/dca-actions'
import { ValidateOccurrence }  from '@/components/dca/validate-occurrence'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'DCA' }

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Hebdo', biweekly: 'Bihebdo', monthly: 'Mensuel', quarterly: 'Trimestriel',
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'danger'; icon: typeof CheckCircle2 }> = {
  pending:   { label: 'À valider',  variant: 'warning', icon: Clock },
  validated: { label: 'Validé',     variant: 'success', icon: CheckCircle2 },
  skipped:   { label: 'Ignoré',     variant: 'muted',   icon: SkipForward },
  cancelled: { label: 'Annulé',     variant: 'danger',  icon: SkipForward },
}

export default async function DcaPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: plans }, { data: envelopes }] = await Promise.all([
    supabase
      .from('dca_plans')
      .select(`
        *,
        envelope:financial_envelopes ( name, envelope_type ),
        occurrences:dca_occurrences (
          id, scheduled_date, planned_amount, actual_amount, status
        )
      `)
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),

    supabase
      .from('financial_envelopes')
      .select('id, name, envelope_type, broker, is_active, user_id, opening_date, created_at, updated_at, currency, notes')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('envelope_type'),
  ])

  return (
    <div>
      <PageHeader
        title="DCA — Investissement programmé"
        subtitle="Planifiez et validez vos achats périodiques"
        action={<DcaActions envelopes={envelopes ?? []} />}
      />

      {!plans?.length ? (
        <EmptyState
          icon={RefreshCw}
          title="Aucun plan DCA"
          description="Créez des plans d'investissement récurrents sur vos actifs financiers."
          action={<DcaActions envelopes={envelopes ?? []} />}
        />
      ) : (
        <div className="space-y-6">
          {plans.map((plan) => {
            const occurrences = plan.occurrences ?? []
            const pending     = occurrences.filter((o: { status: string }) => o.status === 'pending')
            const validated   = occurrences.filter((o: { status: string }) => o.status === 'validated')
            const totalInvested = validated.reduce(
              (s: number, o: { actual_amount: number | null; planned_amount: number }) =>
                s + (o.actual_amount ?? o.planned_amount), 0,
            )
            const pendingSorted = [...pending].sort(
              (a: { scheduled_date: string }, b: { scheduled_date: string }) =>
                a.scheduled_date.localeCompare(b.scheduled_date),
            )

            return (
              <div key={plan.id} className="card overflow-hidden">
                {/* En-tête plan */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-medium text-primary">{plan.name}</h2>
                      <Badge variant="muted" className="font-mono text-xs">{plan.ticker}</Badge>
                      <Badge variant={plan.is_active ? 'success' : 'muted'}>
                        {plan.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                    <p className="text-xs text-secondary">
                      {FREQ_LABELS[plan.frequency]} · {formatCurrency(plan.amount_per_period, plan.currency)} / occurrence
                      {plan.envelope && ` · ${plan.envelope.name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm financial-value text-accent font-medium">
                      {formatCurrency(totalInvested, 'EUR', { compact: true })} investis
                    </p>
                    <p className="text-xs text-secondary">{validated.length} ordres validés</p>
                  </div>
                </div>

                {/* Prochaines occurrences pending */}
                {pendingSorted.length > 0 ? (
                  <div className="px-5 py-4">
                    <p className="text-xs text-secondary uppercase tracking-widest mb-3">À valider</p>
                    <div className="space-y-2">
                      {pendingSorted.slice(0, 3).map((occ: {
                        id: string; scheduled_date: string; planned_amount: number; status: string
                      }) => {
                        const statusConf = STATUS_CONFIG[occ.status] ?? STATUS_CONFIG['pending']!
                        const StatusIcon = statusConf.icon
                        return (
                          <div key={occ.id} className="flex items-center gap-3 p-3 bg-surface-2 rounded-lg">
                            <StatusIcon size={14} className="text-warning flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm text-primary">{formatDate(occ.scheduled_date, 'medium')}</p>
                            </div>
                            <p className="text-sm financial-value text-primary">
                              {formatCurrency(occ.planned_amount, plan.currency)}
                            </p>
                            <ValidateOccurrence
                              occurrence={occ}
                              ticker={plan.ticker}
                              currency={plan.currency}
                            />
                          </div>
                        )
                      })}
                      {pendingSorted.length > 3 && (
                        <p className="text-xs text-secondary text-center pt-1">
                          + {pendingSorted.length - 3} autres occurrences
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="px-5 py-4 text-sm text-secondary">
                    Aucune occurrence en attente.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
