/**
 * `CashKpis` — Server Component (Cash V1.1, Volet C.3).
 *
 * Affiche deux indicateurs sous le total `/cash` :
 *   - Intérêts annuels totaux estimés (Σ balance × taux)
 *   - Taux moyen pondéré du cash
 *
 * Délègue le calcul à `computeCashYield` (helper pur V1.0). Comme les
 * balances arrivent déjà en EUR depuis le Server Component parent (cf.
 * `app/(app)/cash/page.tsx`), on déclare `currency: 'EUR'` pour éviter
 * un round-trip FX inutile.
 */
import { computeCashYield } from '@/lib/cash/rendement'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface Account {
  balance:       number
  interest_rate: number | null
}

interface Props {
  accounts: Account[]
}

export async function CashKpis({ accounts }: Props) {
  if (accounts.length === 0) return null

  const yieldResult = await computeCashYield(
    accounts.map((a) => ({
      balance:       a.balance,
      currency:      'EUR',
      interest_rate: a.interest_rate ?? 0,
    })),
  )

  // Pas d'intérêts à afficher si tous les taux sont à zéro.
  if (yieldResult.interetsAnnuelsTotalEur === 0
   && yieldResult.tauxMoyenPondereDecimal === 0) return null

  return (
    <section
      className="card p-4 mb-6 grid grid-cols-2 gap-4"
      aria-label="Indicateurs cash"
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted">
          Intérêts annuels estimés
        </p>
        <p className="text-lg financial-value font-semibold text-accent mt-0.5">
          {formatCurrency(yieldResult.interetsAnnuelsTotalEur, 'EUR')}
        </p>
      </div>
      <div>
        <p
          className="text-[10px] uppercase tracking-widest text-muted"
          title="Moyenne pondérée par les soldes"
        >
          Taux moyen pondéré
        </p>
        <p className="text-lg financial-value font-semibold text-primary mt-0.5">
          {formatPercent(yieldResult.tauxMoyenPonderePourcent)}
        </p>
      </div>
    </section>
  )
}
