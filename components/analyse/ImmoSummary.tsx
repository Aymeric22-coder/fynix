/**
 * Section "Immobilier" — synthèse par bien + agrégats.
 *
 * Affiche : nom, type, ville, valeur, crédit restant, equity, LTV,
 * loyer brut, charges, cashflow net mensuel, rendements brut/net.
 *
 * Totaux : valeur brute, dettes, equity nette, revenu passif net/mois,
 * rendement net moyen, taux de couverture FIRE.
 */
'use client'

import { Building2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { BienImmo } from '@/types/analyse'

interface Props {
  biens:                BienImmo[]
  totalImmo:            number
  totalDettes:          number
  /** Equity nette = valeur − dettes (calculé en amont). */
  totalImmoEquity:      number
  revenuPassifImmo:     number    // €/mois
  rendementNetImmoMoyen: number   // %
  /** Pour la couverture FIRE (cible mensuelle profile). */
  revenuPassifCible?:   number    // €/mois (depuis profile.revenu_passif_cible)
}

const LEVIER_COLOR: Record<BienImmo['niveau_levier'], string> = {
  'Sans crédit': 'text-secondary',
  'Faible':      'text-accent',
  'Modéré':      'text-warning',
  'Fort':        'text-danger',
}

export function ImmoSummary({
  biens, totalImmo, totalDettes, totalImmoEquity,
  revenuPassifImmo, rendementNetImmoMoyen, revenuPassifCible,
}: Props) {
  const couvertureFire = revenuPassifCible && revenuPassifCible > 0
    ? (revenuPassifImmo / revenuPassifCible) * 100 : null

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Building2 size={13} className="text-secondary" />
        <p className="text-xs text-secondary uppercase tracking-widest">Immobilier</p>
      </div>

      {biens.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucun bien immobilier renseigné.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {biens.map((b) => <BienRow key={b.id} bien={b} />)}
          </div>

          {/* Totaux + couverture FIRE */}
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
            <Total label="Valeur brute"       value={formatCurrency(totalImmo, 'EUR', { compact: true })} />
            <Total label="Crédits restants"   value={formatCurrency(totalDettes, 'EUR', { compact: true })} accent="danger" />
            <Total label="Equity nette"       value={formatCurrency(totalImmoEquity, 'EUR', { compact: true })} accent="success" />
            <Total label="Cashflow / mois"    value={`${revenuPassifImmo >= 0 ? '+' : ''}${formatCurrency(revenuPassifImmo, 'EUR', { decimals: 0 })}`} accent={revenuPassifImmo >= 0 ? 'success' : 'danger'} />
            <Total label="Rdt net moyen"      value={`${rendementNetImmoMoyen.toFixed(1)} %`} />
            {couvertureFire !== null && (
              <Total label="Couverture FIRE"  value={`${couvertureFire.toFixed(0)} %`} accent={couvertureFire >= 50 ? 'success' : undefined} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BienRow({ bien }: { bien: BienImmo }) {
  const cf = bien.cashflow_mensuel
  return (
    <div className="bg-surface-2 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <p className="text-sm text-primary">{bien.nom}</p>
          <p className="text-xs text-muted">
            {bien.type}{bien.ville ? ` · ${bien.ville}` : ''}
            {!bien.donnees_completes && <span className="text-warning ml-2">⚠ Données incomplètes</span>}
          </p>
        </div>
        <span className={cn('text-[10px] uppercase tracking-widest font-medium', LEVIER_COLOR[bien.niveau_levier])}>
          Levier {bien.niveau_levier} {bien.credit_restant > 0 && `· LTV ${bien.ltv.toFixed(0)} %`}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        <Cell label="Valeur"          value={formatCurrency(bien.valeur, 'EUR', { compact: true })} />
        <Cell label="Crédit restant"  value={bien.credit_restant > 0 ? formatCurrency(bien.credit_restant, 'EUR', { compact: true }) : '—'} />
        <Cell label="Equity"          value={formatCurrency(bien.equity, 'EUR', { compact: true })} accent="primary" />
        <Cell label="Loyer brut"      value={bien.loyer_mensuel > 0 ? `${formatCurrency(bien.loyer_mensuel, 'EUR', { decimals: 0 })}/m` : '—'} />
        <Cell label="Cashflow net"
              value={bien.loyer_mensuel > 0
                ? `${cf >= 0 ? '+' : ''}${formatCurrency(cf, 'EUR', { decimals: 0 })}/m`
                : '—'}
              accent={bien.loyer_mensuel > 0 ? (cf >= 0 ? 'success' : 'danger') : undefined} />
        <Cell label="Rdt brut / net"  value={bien.loyer_mensuel > 0
                ? `${formatPercent(bien.rendement_brut, { decimals: 1 })} / ${formatPercent(bien.rendement_net, { decimals: 1 })}`
                : '—'} />
      </div>

      {bien.cashflow_mensuel < 0 && bien.loyer_mensuel > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-warning">
          <AlertCircle size={10} />
          <span>Effort d&apos;épargne mensuel — le bien ne s&apos;autofinance pas (levier en cours d&apos;amortissement).</span>
        </div>
      )}
    </div>
  )
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: 'primary' | 'success' | 'danger' }) {
  const color = accent === 'success' ? 'text-accent'
              : accent === 'danger'  ? 'text-danger'
              : accent === 'primary' ? 'text-primary font-medium'
              : 'text-secondary'
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className={cn('financial-value', color)}>{value}</p>
    </div>
  )
}

function Total({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' }) {
  const color = accent === 'success' ? 'text-accent' : accent === 'danger' ? 'text-danger' : 'text-primary'
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className={cn('financial-value font-semibold', color)}>{value}</p>
    </div>
  )
}
