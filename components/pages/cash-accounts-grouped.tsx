/**
 * `CashAccountsGrouped` — Server Component (Cash V1.4 Vol C).
 *
 * Affiche la liste des comptes cash en 2 sous-sections visuelles :
 *   1. « Épargne »            : tous les comptes hors `compte_courant`
 *   2. « Liquidité courante » : comptes `account_type === 'compte_courant'`
 *
 * Chaque section affiche un sous-titre + un mini-total à droite. Les
 * sections vides sont masquées. Les cartes de comptes elles-mêmes restent
 * inchangées (consomment `CashEditRow` + même structure interne) — c'est
 * un regroupement purement visuel.
 */
import { Badge } from '@/components/ui/badge'
import { CashEditRow } from '@/components/pages/cash-edit-row'
import { CashFreshnessBadge } from '@/components/pages/cash-freshness-badge'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'

const ACCOUNT_LABELS: Record<string, string> = {
  livret_a: 'Livret A', ldds: 'LDDS', lep: 'LEP',
  livret_jeune: 'Livret Jeune', pel: 'PEL', cel: 'CEL',
  compte_courant: 'Compte courant', compte_epargne: 'Compte épargne', other: 'Autre',
}

/**
 * Forme attendue d'une ligne `cash_accounts` enrichie (asset:name).
 * Cf. `app/(app)/cash/page.tsx` pour la requête source.
 */
export interface CashAccountForList {
  id:            string
  account_type:  string
  bank_name:     string | null
  balance:       number
  interest_rate: number
  balance_date:  string | null
  asset?: { name?: string | null } | null
  // Champs étendus consommés par `CashEditRow` (le sous-composant les retypera).
  [k: string]: unknown
}

interface Props {
  accounts: CashAccountForList[]
}

export function CashAccountsGrouped({ accounts }: Props) {
  const epargne = accounts.filter((a) => a.account_type !== 'compte_courant')
  const courant = accounts.filter((a) => a.account_type === 'compte_courant')
  const totalEpargne = epargne.reduce((s, a) => s + Number(a.balance), 0)
  const totalCourant = courant.reduce((s, a) => s + Number(a.balance), 0)

  return (
    <div className="space-y-6">
      {epargne.length > 0 && (
        <Section
          title="Épargne"
          total={totalEpargne}
          accounts={epargne}
          ariaLabel="Comptes d'épargne"
        />
      )}
      {courant.length > 0 && (
        <Section
          title="Liquidité courante"
          total={totalCourant}
          accounts={courant}
          ariaLabel="Comptes courants"
        />
      )}
    </div>
  )
}

function Section({
  title, total, accounts, ariaLabel,
}: {
  title: string
  total: number
  accounts: CashAccountForList[]
  ariaLabel: string
}) {
  return (
    <section aria-label={ariaLabel}>
      <header className="flex items-baseline justify-between gap-3 mb-2.5">
        <h2 className="text-[10px] uppercase tracking-widest text-muted/70">
          {title}
        </h2>
        <p className="text-xs text-secondary financial-value">
          {formatCurrency(total, 'EUR', { compact: true })}
        </p>
      </header>

      <div className="space-y-3">
        {accounts.map((account) => {
          const annualInterest = Number(account.balance) * (Number(account.interest_rate) / 100)
          return (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <CashEditRow key={account.id} account={account as any}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-medium text-primary">{account.asset?.name}</h3>
                  <Badge variant="muted">
                    {ACCOUNT_LABELS[account.account_type] ?? account.account_type}
                  </Badge>
                  {/* V1.4 Vol D — Badge fraîcheur si balance_date ancien. */}
                  <CashFreshnessBadge balanceDate={account.balance_date} />
                </div>
                <p className="text-xs text-secondary">
                  {account.bank_name && `${account.bank_name} · `}
                  Mis à jour {formatDate(account.balance_date, 'medium')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg financial-value font-semibold text-primary">
                  {formatCurrency(Number(account.balance), 'EUR')}
                </p>
                {Number(account.interest_rate) > 0 && (
                  <p className="text-xs text-accent mt-0.5">
                    {formatPercent(Number(account.interest_rate))} · {formatCurrency(annualInterest, 'EUR')} / an
                  </p>
                )}
              </div>
            </CashEditRow>
          )
        })}
      </div>
    </section>
  )
}
