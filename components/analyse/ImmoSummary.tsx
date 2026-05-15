/**
 * Section "Immobilier" : pour chaque bien, KPIs (valeur, loyer, crédit
 * restant, equity, rendement brut). Total en bas.
 */
'use client'

import { Building2 } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { BienImmo } from '@/types/analyse'

interface Props {
  biens:        BienImmo[]
  totalImmo:    number
  totalDettes:  number
}

export function ImmoSummary({ biens, totalImmo, totalDettes }: Props) {
  const equityNette = totalImmo - totalDettes
  const loyerTotal  = biens.reduce((s, b) => s + b.loyer_mensuel, 0)

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
            {biens.map((b) => (
              <div key={b.id} className="bg-surface-2 rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                <div className="col-span-2">
                  <p className="text-sm text-primary truncate">{b.nom}</p>
                  <p className="text-xs text-muted">
                    {b.type}{b.ville ? ` · ${b.ville}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-widest">Valeur</p>
                  <p className="text-sm financial-value text-primary">
                    {formatCurrency(b.valeur, 'EUR', { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-widest">Loyer/mois</p>
                  <p className="text-sm financial-value text-accent">
                    {b.loyer_mensuel > 0 ? formatCurrency(b.loyer_mensuel, 'EUR', { decimals: 0 }) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-widest">Equity</p>
                  <p className="text-sm financial-value text-primary">
                    {formatCurrency(b.equity, 'EUR', { compact: true })}
                  </p>
                  {b.rendement_brut > 0 && (
                    <p className="text-[10px] text-secondary">
                      Rdt brut {formatPercent(b.rendement_brut, { decimals: 1 })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totaux */}
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Total label="Valeur brute"   value={formatCurrency(totalImmo, 'EUR', { compact: true })} />
            <Total label="Crédits restants" value={formatCurrency(totalDettes, 'EUR', { compact: true })} accent="danger" />
            <Total label="Equity nette"   value={formatCurrency(equityNette, 'EUR', { compact: true })} accent="success" />
            <Total label="Loyer mensuel"  value={loyerTotal > 0 ? formatCurrency(loyerTotal, 'EUR', { decimals: 0 }) : '—'} />
          </div>
        </>
      )}
    </div>
  )
}

function Total({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' }) {
  const color = accent === 'success' ? 'text-accent' : accent === 'danger' ? 'text-danger' : 'text-primary'
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className={`financial-value font-semibold ${color}`}>{value}</p>
    </div>
  )
}
