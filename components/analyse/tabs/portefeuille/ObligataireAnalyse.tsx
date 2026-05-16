/**
 * Sous-onglet Portefeuille > Obligataire.
 *
 * Type, duration estimée, risque crédit. Données souvent partielles
 * dans l'app (pas de YTM/duration en DB) → affichage volontairement
 * sobre avec valeurs de référence et appel à compléter.
 */
'use client'

import { Info } from 'lucide-react'
import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

const OAT_10Y_REF = 3.0  // % référence taux sans risque France

export function ObligataireAnalyse({ data }: Props) {
  const bonds = useMemo(
    () => data.positions.filter((p) => p.asset_type === 'bond'),
    [data.positions],
  )
  const totalValue = bonds.reduce((s, p) => s + p.current_value, 0)

  return (
    <div className="space-y-4">
      {/* Vue d'ensemble */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Vue d&apos;ensemble obligataire</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Kpi label="Nombre de lignes" value={String(bonds.length)} />
          <Kpi label="Valeur totale"    value={formatCurrency(totalValue, 'EUR', { compact: true })} />
          <Kpi label="OAT 10 ans (réf)" value={`${OAT_10Y_REF.toFixed(1)} %`} />
        </div>
      </div>

      {/* Liste des positions */}
      {bonds.length > 0 && (
        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest mb-3">Positions obligataires</p>
          <div className="space-y-2">
            {bonds.map((b) => (
              <div key={b.isin || b.name} className="flex items-center justify-between text-sm bg-surface-2 rounded-lg px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-primary truncate">{b.name}</p>
                  <p className="text-[10px] text-muted">{b.isin || '—'} · {b.country ?? 'Pays non renseigné'}</p>
                </div>
                <p className="financial-value text-primary">{formatCurrency(b.current_value, 'EUR', { decimals: 0 })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes informatives */}
      <div className="card p-4 bg-surface-2 space-y-3 text-xs text-secondary leading-relaxed">
        <div className="flex items-start gap-2">
          <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p>
            <span className="text-primary">Risque de taux :</span> les obligations à longue durée
            résiduelle (&gt; 7 ans) sont sensibles à une hausse des taux. Pour une analyse fine, il
            faudrait connaître la duration de chaque ligne — données non disponibles dans l&apos;app
            actuellement.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p>
            <span className="text-primary">Risque crédit :</span> les obligations Investment Grade
            (notation ≥ BBB-) ont un faible risque de défaut, contrairement aux High Yield. La
            notation des émetteurs n&apos;est pas dans la base — référez-vous au prospectus de
            chaque ligne.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p>
            <span className="text-primary">Rendement (YTM) :</span> à comparer au taux sans risque
            (OAT 10 ans français ≈ {OAT_10Y_REF.toFixed(1)} %). Un YTM &lt; OAT signifie que vous
            êtes mieux servi par un Livret A.
          </p>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
      <p className="text-base font-semibold financial-value text-primary mt-1">{value}</p>
    </div>
  )
}
