/**
 * `CashIntentsList` — Server Component (Cash V1.2, Volet E).
 *
 * Section « Cash volontaire » sur `/cash`, ancrée `#cash-intents`
 * (cible du badge sous la jauge matelas).
 *
 * Pour les intentions sans `target_date`, on affiche l'âge depuis
 * `created_at` (« créée il y a X mois ») afin d'éviter qu'un projet
 * dormant ne se transforme en « cash dormant » oublié.
 */
import { Sparkles } from 'lucide-react'
import {
  CASH_INTENT_MOTIF_LABEL,
  formatCreatedAgo,
} from '@/lib/cash/intents-labels'
import { getIntentAgeInDays } from '@/lib/cash/intents'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { CashIntent } from '@/lib/cash/intents'
import { CashIntentActions } from './cash-intent-actions'
import { CashIntentEditRow } from './cash-intent-edit-row'

interface CashAccountMeta {
  id:   string
  name: string
}

interface Props {
  intents:        CashIntent[]
  cashAccounts:   CashAccountMeta[]
}

export function CashIntentsList({ intents, cashAccounts }: Props) {
  const accountById = new Map(cashAccounts.map((a) => [a.id, a.name]))

  return (
    <section id="cash-intents" className="mt-8 scroll-mt-20" aria-label="Cash volontaire">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-primary flex items-center gap-2">
            <Sparkles size={16} className="text-accent" aria-hidden />
            Cash volontaire
          </h2>
          <p className="text-xs text-secondary mt-1 max-w-xl">
            Déclare le cash que tu mets de côté pour un projet précis. Il ne
            déclenchera plus d&apos;alerte sur-liquidité, et apparaîtra comme
            volontaire dans ton matelas effectif.
          </p>
        </div>
        <CashIntentActions cashAccounts={cashAccounts} />
      </div>

      {intents.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-secondary">
            Aucune intention déclarée pour l&apos;instant.
          </p>
          <p className="text-xs text-muted mt-1.5">
            Exemple : « Apport immobilier — achat Saint-Brieuc Q4 ».
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {intents.map((intent) => {
            const accountName = intent.cash_account_id
              ? accountById.get(intent.cash_account_id) ?? null
              : null
            return (
              <CashIntentEditRow
                key={intent.id}
                intent={intent}
                cashAccounts={cashAccounts}
              >
                <IntentCardBody intent={intent} accountName={accountName} />
              </CashIntentEditRow>
            )
          })}
        </div>
      )}
    </section>
  )
}

function IntentCardBody({
  intent, accountName,
}: { intent: CashIntent; accountName: string | null }) {
  const motifLabel = CASH_INTENT_MOTIF_LABEL[intent.motif]
  const ageDays    = getIntentAgeInDays(intent)
  return (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium text-primary truncate">
            {motifLabel}
            {intent.motif_libre ? <span className="text-secondary"> — {intent.motif_libre}</span> : null}
          </h3>
        </div>
        <p className="text-xs text-muted">
          {intent.target_date
            ? <>Cible : {formatDate(intent.target_date, 'medium')}</>
            : formatCreatedAgo(ageDays)
          }
          {accountName && <> · depuis {accountName}</>}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg financial-value font-semibold text-primary">
          {formatCurrency(intent.montant, 'EUR')}
        </p>
      </div>
    </>
  )
}
