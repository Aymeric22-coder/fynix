import { Metadata } from 'next'
import { PiggyBank } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader }       from '@/components/shared/page-header'
import { EmptyState }       from '@/components/ui/empty-state'
import { Badge }            from '@/components/ui/badge'
import { CashActions }      from '@/components/pages/cash-actions'
import { CashEditRow }      from '@/components/pages/cash-edit-row'
import { CashMatelasCard }  from '@/components/pages/cash-matelas-card'
import { CashKpis }         from '@/components/pages/cash-kpis'
import { CashIntentsList }  from '@/components/pages/cash-intents-list'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'
import { computeCashTotals } from '@/lib/cash/totals'
import { computeMatelasEffectif } from '@/lib/cash/intents'
import { getProfileContext } from '@/lib/profil/getProfileContext'
import type { CashIntent } from '@/lib/cash/intents'

export const metadata: Metadata = { title: 'Cash & Épargne' }

const ACCOUNT_LABELS: Record<string, string> = {
  livret_a: 'Livret A', ldds: 'LDDS', lep: 'LEP',
  livret_jeune: 'Livret Jeune', pel: 'PEL', cel: 'CEL',
  compte_courant: 'Compte courant', compte_epargne: 'Compte épargne', other: 'Autre',
}

export default async function CashPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // V1.1 C — Profil lu en parallèle pour alimenter le bloc matelas.
  // Dégradation propre : si la ligne `profiles` est absente ou si un
  // champ est ≤ 0, `profileContext` est tout-null et `CashMatelasCard`
  // propose un CTA vers Profil au lieu d'une cible erronée.
  const [{ data: accounts }, profileContext, { data: intentsRaw }] = await Promise.all([
    supabase
      .from('cash_accounts')
      .select(`
        *,
        asset:assets!asset_id ( name, status )
      `)
      .eq('user_id', user!.id)
      .order('account_type'),
    getProfileContext(supabase, user!.id),
    supabase
      .from('cash_intents')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
  ])
  const intents = (intentsRaw ?? []) as CashIntent[]

  // V1.1 P0 — Total cash unifié via `computeCashTotals`, supporte le
  // multi-devise (corrige le bug FX silencieux de la page identifié dans
  // l'audit C9). Pour un utilisateur 100 % EUR, le résultat est strictement
  // identique à l'ancien `reduce(balance)`.
  const totals = await computeCashTotals(
    (accounts ?? []).map((a) => ({
      id:           a.id,
      asset_id:     a.asset_id,
      balance:      Number(a.balance),
      currency:     a.currency ?? 'EUR',
      account_type: a.account_type,
    })),
  )
  const total = totals.totalEur

  // V1.1 C.3 — KPI cash (intérêts + taux moyen pondéré). Pré-mapping vers
  // `CashAccountForYield`-friendly : balance en EUR, interest_rate normalisé.
  const accountsForKpi = (accounts ?? []).map((a) => ({
    balance:       Number(a.balance),
    interest_rate: typeof a.interest_rate === 'number' ? a.interest_rate : Number(a.interest_rate ?? 0),
  }))

  // V1.2 Volet D — matelas effectif = cash brut − Σ intents actives.
  const matelasEffectif = computeMatelasEffectif(total, intents)

  // Méta des comptes cash pour le sélecteur de la modale d'intentions
  // ET la liste (libellé « depuis … »).
  const cashAccountMeta = (accounts ?? []).map((a) => ({
    id:   a.id as string,
    name: (a.asset?.name as string | null | undefined) ?? 'Compte',
  }))

  return (
    <div>
      <PageHeader
        title="Cash & Épargne"
        subtitle={accounts?.length ? `${accounts.length} compte${accounts.length > 1 ? 's' : ''} · ${formatCurrency(total, 'EUR', { compact: true })}` : undefined}
        action={<CashActions />}
      />

      {!accounts?.length ? (
        <>
          <EmptyState
            icon={PiggyBank}
            title="Aucun compte"
            description="Ajoutez vos livrets et comptes courants pour centraliser votre cash."
            action={<CashActions />}
            ariaPrompt="Je n'ai pas encore de compte renseigné. Explique-moi comment organiser mon épargne de précaution avec mon profil."
          />
          {/* V1.1 C.5 — Pédagogie inline sous l'état vide. */}
          <p className="max-w-md mx-auto text-center text-xs text-muted mt-4 px-4">
            Le cash sert de <strong className="text-secondary">matelas de sécurité</strong> :
            3 à 6 mois de charges pour un revenu stable, 6 à 12 mois pour un revenu variable.
            Tes paramètres Profil détermineront ta cible.
          </p>
        </>
      ) : (
        <>
          {/* Total */}
          <div className="card p-5 border-accent/20 mb-6">
            <p className="text-xs text-secondary uppercase tracking-widest">Total disponible</p>
            <p className="text-3xl font-semibold financial-value text-accent mt-2">
              {formatCurrency(total, 'EUR', { compact: true })}
            </p>
          </div>

          {/* V1.1 C.3 — KPI cash : intérêts annuels + taux moyen pondéré */}
          <CashKpis accounts={accountsForKpi} />

          {/* V1.1 C.2 — Bloc matelas (4 états) + V1.2 D — statut sur effectif.
              V1.3 Vol C — ancre #matelas pour scroll depuis CouvertureCash. */}
          <div id="matelas" className="scroll-mt-20">
            <CashMatelasCard
              totalCash={total}
              profile={profileContext}
              cashEffectif={matelasEffectif.cashEffectif}
              totalIntentsActives={matelasEffectif.totalIntentsActives}
              countIntentsActives={matelasEffectif.countIntentsActives}
            />
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

          {/* V1.2 Volet E — Section Cash volontaire (ancre #cash-intents) */}
          <CashIntentsList
            intents={matelasEffectif.intentsActives}
            cashAccounts={cashAccountMeta}
          />
        </>
      )}
    </div>
  )
}
