/**
 * AllocationDonut — Donut de répartition par classe d'actif (V2.5 ST3).
 *
 * Réactive le donut historique (commenté depuis V1.0 / V1.4) avec la
 * taxonomie unifiée V1.2 P0.6 (« immobilier_physique », « obligations »,
 * « etf », « actions »…). Inséré en Z4 (Pilotage) sous les KPIs et
 * au-dessus du sous-titre « Ce qui demande ton attention ».
 *
 * **Pédagogique** : un bandeau d'aide sous le donut explique le
 * regroupement des fonds euros d'assurance-vie dans la catégorie
 * « obligations » (décision V1.2 sur la classification par risque
 * économique majoritaire — pas par enveloppe fiscale). Sans cette
 * explication, l'utilisateur peut être surpris de voir son AV
 * classée comme obligation.
 *
 * **Empty state** : si `slices.length === 0` ou si la somme est nulle,
 * le composant retourne `null` (pas de carte vide).
 */
import { Info } from 'lucide-react'
import { DonutChart } from '@/components/charts/donut-chart'
import { formatCurrency } from '@/lib/utils/format'
import type { DashboardAllocationSlice } from '@/lib/analyse/dashboard-pipeline'

interface Props {
  slices:           DashboardAllocationSlice[]
  /** Total brut affiché au centre du donut (sert d'ancre visuelle). */
  totalGrossEur:    number
}

export function AllocationDonut({ slices, totalGrossEur }: Props) {
  if (slices.length === 0) return null
  if (totalGrossEur <= 0) return null

  // Mappe la shape pipeline → shape DonutChart (existante, V1.0).
  const donutData = slices.map((s) => ({
    type:    s.key,
    label:   s.label,
    value:   s.valueEur,
    percent: s.percent,
    color:   s.color,
  }))

  const hasObligations = slices.some((s) => s.key === 'obligations')

  return (
    <section className="card p-5" aria-label="Répartition du patrimoine par classe d'actif">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-primary">Répartition du patrimoine</h2>
        <p className="text-xs text-secondary mt-0.5">
          {slices.length} classe{slices.length > 1 ? 's' : ''} d&apos;actif · taxonomie unifiée
        </p>
      </div>

      <DonutChart
        data={donutData}
        centerValue={formatCurrency(totalGrossEur, 'EUR', { compact: true })}
        centerLabel="Brut total"
      />

      {/* V2.5 — Bandeau pédagogique fonds euros (s'affiche uniquement si
          la classe « obligations » est présente, sinon il n'a pas de sens). */}
      {hasObligations && (
        <p className="mt-4 text-xs text-secondary flex items-start gap-1.5 leading-relaxed">
          <Info size={11} className="text-accent/70 flex-shrink-0 mt-0.5" />
          <span>
            <strong className="text-primary font-medium">Obligations</strong> inclut les fonds
            euros d&apos;assurance-vie : ils sont classés selon leur risque économique
            majoritairement obligataire, et non selon leur enveloppe fiscale.
          </span>
        </p>
      )}
    </section>
  )
}
