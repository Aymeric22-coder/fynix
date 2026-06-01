/**
 * ZonePilotage — Z4 de l'architecture Dashboard V2.
 *
 * Bloc fusionné qui regroupe ce que l'utilisateur doit voir « tout de suite »
 * pour piloter son patrimoine :
 *   1. 4 KPIs Net / Brut+badge / CF immo / Performance
 *   2. (conditionnel) Sous-titre « Ce qui demande ton attention »
 *   3. (conditionnel) Alertes générales (sur-exposition, stale data, etc.)
 *   4. (conditionnel) Alertes drift immobilier
 *   5. (conditionnel) Actions du mois NON-FISCALES (rebalance, cash dormant, DCA en retard)
 *
 * Les actions fiscales (optim PER, AV vs CTO…) sont reléguées dans
 * `ZoneFiscaliteToggle` (Z9), masquées par défaut derrière un toggle.
 *
 * Server Component pur — pas d'état, juste de la composition.
 */
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import { AlertsPanel } from '@/components/dashboard/alerts-panel'
import {
  RealEstateAlertsPanel,
  type PropertyDriftSummary,
} from '@/components/dashboard/real-estate-alerts-panel'
import { ActionsDuMois } from '@/components/dashboard/actions-du-mois'
import type { DashboardKpis, DashboardAlert } from '@/lib/analyse/dashboard-pipeline'
import type { ActionMensuelle } from '@/lib/analyse/recoMensuelles'

interface Props {
  /** KPIs pipeline V1 (Option B : Net / Brut+badge / CF immo / Performance). */
  kpis: DashboardKpis
  /** Compteur des positions sans MV — affiche le badge sur la carte Brut. */
  unvaluedPositionsCount:  number
  /** Label déjà formaté pour le badge. */
  unvaluedPositionsLabel:  string
  /** Alertes générales (over_exposure / stale_data / sim_incomplete). */
  alerts: DashboardAlert[]
  /** Résumés drift immobilier par bien (V1 P0.8). */
  driftSummaries: PropertyDriftSummary[]
  /** Toutes les actions du mois (fiscales + non-fiscales) — on filtre côté UI. */
  actions: ActionMensuelle[]
}

export function ZonePilotage({
  kpis,
  unvaluedPositionsCount,
  unvaluedPositionsLabel,
  alerts,
  driftSummaries,
  actions,
}: Props) {
  // Y a-t-il quelque chose à signaler en dessous des KPIs ?
  // (au moins une alerte OU une action non-fiscale)
  const hasNonFiscalActions = actions.some((a) => a.type !== 'fiscal')
  const hasAttention =
    alerts.length > 0 || driftSummaries.length > 0 || hasNonFiscalActions

  return (
    <section className="space-y-4" aria-label="Pilotage patrimoine">
      {/* (1) KPIs — taille équivalente V1 (4 cartes via KpiGrid) */}
      <KpiGrid
        kpis={kpis}
        unvaluedPositionsCount={unvaluedPositionsCount}
        unvaluedPositionsLabel={unvaluedPositionsLabel}
      />

      {/* (2) Sous-titre uniquement si on a au moins un item à signaler */}
      {hasAttention && (
        <h3 className="text-xs font-medium text-secondary uppercase tracking-widest pt-2">
          Ce qui demande ton attention
        </h3>
      )}

      {/* (3) Alertes générales — déjà conditionnellement masquées par AlertsPanel */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* (4) Alertes drift immobilier */}
      {driftSummaries.length > 0 && (
        <RealEstateAlertsPanel summaries={driftSummaries} />
      )}

      {/* (5) Actions du mois NON-FISCALES — le composant retourne null en interne
              si la liste filtrée est vide (cf. V2.2 ST1). */}
      <ActionsDuMois actions={actions} filter="non-fiscal" />
    </section>
  )
}
