/**
 * Section "Cash & liquidités" : liste des comptes + total + alerte si
 * cash > 20 % du patrimoine.
 */
'use client'

import { PiggyBank, AlertCircle } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { CompteCash } from '@/types/analyse'

interface Props {
  comptes:    CompteCash[]
  totalCash:  number
  totalBrut:  number
}

const CASH_TYPE_LABEL: Record<string, string> = {
  livret_a:       'Livret A',
  ldds:           'LDDS',
  lep:            'LEP',
  pel:            'PEL',
  cel:            'CEL',
  compte_courant: 'Compte courant',
  autre:          'Autre',
}

const CASH_ALERT_PCT = 20

export function CashSummary({ comptes, totalCash, totalBrut }: Props) {
  const pctOfTotal = totalBrut > 0 ? (totalCash / totalBrut) * 100 : 0
  const alerte     = pctOfTotal > CASH_ALERT_PCT

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <PiggyBank size={13} className="text-secondary" />
        <p className="text-xs text-secondary uppercase tracking-widest">Cash &amp; liquidités</p>
      </div>

      {comptes.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucun compte renseigné.</p>
      ) : (
        <>
          <div className="space-y-2">
            {comptes.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm text-primary">{c.nom}</p>
                  <p className="text-xs text-muted">
                    {CASH_TYPE_LABEL[c.type] ?? c.type}{c.banque ? ` · ${c.banque}` : ''}
                  </p>
                </div>
                <p className="text-sm financial-value text-primary">
                  {formatCurrency(c.solde, 'EUR', { decimals: 0 })}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
            <span className="text-secondary">Total cash</span>
            <div className="text-right">
              <p className="financial-value text-primary font-semibold">
                {formatCurrency(totalCash, 'EUR', { compact: true })}
              </p>
              <p className="text-xs text-muted">{formatPercent(pctOfTotal, { decimals: 1 })} du patrimoine</p>
            </div>
          </div>

          {alerte && (
            <div className="mt-3 flex items-start gap-2 bg-warning-muted border border-warning/30 rounded-lg px-3 py-2 text-xs">
              <AlertCircle size={13} className="text-warning flex-shrink-0 mt-0.5" />
              <span className="text-primary">
                Votre cash représente <span className="text-warning font-medium">{formatPercent(pctOfTotal, { decimals: 1 })}</span> de votre patrimoine — une partie pourrait être investie pour générer du rendement.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
