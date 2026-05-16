/**
 * Sous-onglet Portefeuille > Métaux précieux.
 *
 * Répartition par type (or/argent/etc.), poids dans le patrimoine,
 * recommandation 5-10 % couverture.
 */
'use client'

import { useMemo } from 'react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { PatrimoineComplet, EnrichedPosition } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

function metalTypeOf(p: EnrichedPosition): 'Or' | 'Argent' | 'Platine' | 'Palladium' | 'Autre' {
  const txt = `${p.name} ${p.isin}`.toUpperCase()
  if (/GOLD|\bOR\b|XAU|GLD/.test(txt))         return 'Or'
  if (/SILVER|ARGENT|XAG|SLV/.test(txt))       return 'Argent'
  if (/PLATINUM|PLATINE|XPT|PLT/.test(txt))    return 'Platine'
  if (/PALLADIUM|XPD|PAL/.test(txt))           return 'Palladium'
  return 'Autre'
}

const TYPE_COLOR: Record<string, string> = {
  Or:        'bg-amber-400',
  Argent:    'bg-zinc-400',
  Platine:   'bg-slate-300',
  Palladium: 'bg-stone-400',
  Autre:     'bg-muted',
}

export function MetauxAnalyse({ data }: Props) {
  const metaux = useMemo(
    () => data.positions.filter((p) => p.asset_type === 'metal'),
    [data.positions],
  )
  const totalValue = metaux.reduce((s, p) => s + p.current_value, 0)

  // Répartition par type
  const repartition = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of metaux) {
      const type = metalTypeOf(p)
      map.set(type, (map.get(type) ?? 0) + p.current_value)
    }
    return Array.from(map.entries())
      .map(([type, value]) => ({ type, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [metaux, totalValue])

  const partPatrimoine = data.totalNet > 0 ? (totalValue / data.totalNet) * 100 : 0
  const niveau =
    partPatrimoine < 3   ? { tone: 'text-warning', txt: 'Couverture insuffisante — l\'or est recommandé à 5-10 % du patrimoine pour une protection inflation/crise.' } :
    partPatrimoine <= 10 ? { tone: 'text-accent',  txt: 'Allocation dans la fourchette recommandée (5-10 % du patrimoine).' } :
    partPatrimoine <= 15 ? { tone: 'text-secondary', txt: 'Allocation un peu au-dessus de la recommandation classique mais acceptable selon votre conviction.' } :
                           { tone: 'text-danger',   txt: '⚠ Surpondération — actif non productif de revenus, opportunité-coût élevée.' }

  return (
    <div className="space-y-4">
      {/* Répartition par type */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Répartition par métal</p>
        {repartition.length === 0 ? (
          <p className="text-sm text-secondary">Aucune position détectée.</p>
        ) : (
          <div className="space-y-2.5">
            {repartition.map((r) => (
              <div key={r.type} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-right text-primary flex-shrink-0">{r.type}</span>
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${TYPE_COLOR[r.type]}`} style={{ width: `${r.pct}%` }} />
                </div>
                <span className="w-20 text-right financial-value text-secondary text-xs">
                  {formatPercent(r.pct, { decimals: 1 })} · {formatCurrency(r.value, 'EUR', { compact: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Poids dans le patrimoine */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Rôle dans le patrimoine</p>
        <div className="flex items-baseline gap-3 mb-3">
          <p className="text-2xl font-semibold financial-value text-amber-400">
            {formatPercent(partPatrimoine, { decimals: 1 })}
          </p>
          <p className="text-xs text-secondary">
            soit {formatCurrency(totalValue, 'EUR', { decimals: 0 })} sur {formatCurrency(data.totalNet, 'EUR', { compact: true })}
          </p>
        </div>
        <p className={`text-xs leading-relaxed ${niveau.tone}`}>{niveau.txt}</p>
        <p className="text-[10px] text-muted mt-3 leading-relaxed">
          L&apos;or est historiquement une protection contre l&apos;inflation et les crises
          systémiques. Allocation recommandée par les analystes : 5-10 % du patrimoine.
        </p>
      </div>

      {/* Note forme de détention */}
      <div className="card p-4 bg-surface-2 text-xs text-secondary leading-relaxed">
        <p className="text-primary mb-1.5">Forme de détention</p>
        <ul className="space-y-1 ml-3">
          <li>• <span className="text-primary">Physique (lingots, pièces)</span> : sécurité maximale, liquidité faible, primes d&apos;achat/vente.</li>
          <li>• <span className="text-primary">ETF or (ex: GLD, GLDEUR, AMUNDI EUR)</span> : liquidité haute, frais TER ~0.2 %.</li>
          <li>• <span className="text-primary">Certificats (BNP, SG)</span> : liquidité haute, risque émetteur.</li>
        </ul>
      </div>
    </div>
  )
}
