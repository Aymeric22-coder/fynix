/**
 * CS5 — Builder de vecteurs `life events` pour le moteur de projection FIRE.
 *
 * Transforme un `LifeEventRow[]` actif en :
 *   - `revenuPassifExceptionnelParAnnee[]` (€ ponctuels à l'année y),
 *   - `epargneDeltaParAnnee[]` (€/mois additionné à l'épargne de base à y),
 *   - `acquisitionsFuturesFromEvents` (Achat RP réutilise le moteur existant).
 *
 * Pure (pas d'I/O). Non-régression bit-pour-bit garantie : si la liste
 * d'évènements actifs est vide, les vecteurs retournés sont vides → le
 * moteur tombe sur le fallback `?? 0` partout.
 *
 * Décisions arbitrées (cf. message user CS5 implémentation) :
 *   #1 Pension fallback 50% revenu_mensuel si non saisie.
 *   #3 Naissance : -300 €/m × N pendant 22 ans à partir de la date. Ne
 *      touche PAS cibleFamille (dette refactoring time-bounded acceptée).
 *   #6 Dates : MM/AAAA UI → AAAA engine via Math.round((y + m/12) - now).
 *   #7 MVP = 1 seul capital exceptionnel autorisé côté UI mais la fonction
 *      accepte une liste (extension future triviale).
 */

import type { LifeEventRow } from '@/types/database.types'
import type { AcquisitionFuture } from '@/types/analyse'
import {
  NAISSANCE_COUT_MENSUEL_EUR,
  NAISSANCE_DUREE_PRISE_EN_CHARGE_ANS,
  PENSION_TAUX_REMPLACEMENT_FALLBACK,
  lifeEventYearsFromNow,
} from './lifeEventsConstants'

/**
 * Inputs profil agrégés nécessaires au builder. Volontairement plus simple
 * que `Profile` complet pour rester testable sans monter une fixture BDD.
 * - `revenu_mensuel_total` = revenu_mensuel + revenu_conjoint + autres_revenus
 *   (somme déjà calculée côté aggregateur via `loadProfile`).
 */
export interface LifeEventProfileSlice {
  age:                  number | null
  revenu_mensuel_total: number
  epargne_mensuelle:    number
}

export interface LifeEventVectors {
  /** Index = année (0..horizon). Inflow ponctuel ajouté au capital. */
  revenuPassifExceptionnelParAnnee: number[]
  /** Index = année. Delta sur l'épargne mensuelle de base. */
  epargneDeltaParAnnee: number[]
  /**
   * Acquisitions futures générées depuis les évènements Achat RP.
   * À fusionner avec `inputs.acquisitionsFutures` côté aggregateur.
   */
  acquisitionsFuturesFromEvents: AcquisitionFuture[]
  /**
   * Résumé par évènement actif pour affichage UI (transparence).
   * Index dans `events` filtrés actifs, pour réutilisation dans
   * lifeEventsExplain.
   */
  appliedEvents: ReadonlyArray<{
    id:     string
    type:   LifeEventRow['type']
    yearOffset: number   // delta années depuis now (peut être 0 ou négatif)
    label:  string | null
    montant: number | null
  }>
}

interface BuildOptions {
  /** Horizon en années du moteur de projection. Default 35. */
  horizon?: number
  /** Override de la date "aujourd'hui" (utile en tests). */
  now?:     Date
}


/**
 * Construit les vecteurs et acquisitions futures à partir d'une liste
 * d'évènements actifs et du profil. Les évènements `is_active=false` ou
 * antérieurs à `now` (sauf retraite déjà active) sont ignorés.
 *
 * Le tableau retourné est dimensionné à `horizon + 1` (indices 0..horizon).
 * `index 0` (année actuelle) reste à 0 sauf pour la retraite si elle est
 * déjà active (statut_pro retraité géré côté caller, ici on ne reçoit que
 * des évènements futurs).
 */
export function buildLifeEventVectors(
  events:  ReadonlyArray<LifeEventRow>,
  profile: LifeEventProfileSlice,
  opts:    BuildOptions = {},
): LifeEventVectors {
  const horizon = Math.max(5, Math.min(50, opts.horizon ?? 35))
  const now     = opts.now ?? new Date()

  const revenuExceptionnel: number[] = new Array(horizon + 1).fill(0) as number[]
  const epargneDelta:       number[] = new Array(horizon + 1).fill(0) as number[]
  const acquisitions:       AcquisitionFuture[] = []
  const applied:            LifeEventVectors['appliedEvents'][number][] = []

  const revenuTotal       = profile.revenu_mensuel_total
  const epargneActuelle   = profile.epargne_mensuelle ?? 0
  // Charges consommées implicites = ce que l'utilisateur dépense aujourd'hui.
  // Hypothèse simple : à la retraite, les charges restent constantes en réel.
  const chargesEstimees   = Math.max(0, revenuTotal - epargneActuelle)

  for (const evt of events) {
    if (!evt.is_active) continue
    const yEvt = lifeEventYearsFromNow(evt.occurrence_date, now)
    if (yEvt === null) continue

    switch (evt.type) {
      case 'capital_exceptionnel': {
        // Héritage / vente d'entreprise — inflow ponctuel à year y.
        // CS2 LOT 0 — Bug double-comptage fixé :
        //   Avant : `y = max(0, min(horizon, yEvt))` injectait les héritages
        //   PASSÉS sur year 0. Mais un héritage déjà perçu se retrouve dans
        //   `totalCash` réel (déposé sur Livret A) → double-comptage de
        //   80 k€ qui re-impactaient la projection sur l'année courante.
        //   Maintenant : `yEvt < 0` → événement SKIP entièrement. Le
        //   patrimoine réel agrégé contient déjà le capital perçu.
        // - y > horizon : ignoré (hors fenêtre, comportement préservé).
        if (yEvt < 0) {
          // Passé : déjà inclus dans totalCash/totalPortefeuille réel.
          applied.push({
            id: evt.id, type: evt.type, yearOffset: yEvt,
            label: evt.label, montant: evt.montant,
          })
          break
        }
        const y = Math.min(horizon, yEvt)
        const montant = Number.isFinite(evt.montant ?? NaN) ? evt.montant! : 0
        if (montant > 0) {
          revenuExceptionnel[y] = (revenuExceptionnel[y] ?? 0) + montant
        }
        applied.push({
          id: evt.id, type: evt.type, yearOffset: yEvt,
          label: evt.label, montant: evt.montant,
        })
        break
      }

      case 'retraite': {
        // Bascule épargne : à partir de year y_retraite, épargne devient
        //   `pension - charges` au lieu de `revenu_total - charges = epargne_actuelle`.
        // Donc `delta(y) = (pension - charges) - epargne_actuelle` à partir
        // de y_retraite.
        // Pension fallback (#1) : si non saisie ou non-positive, 50% du revenu actuel.
        const pension = (evt.montant !== null && Number.isFinite(evt.montant) && evt.montant > 0)
          ? evt.montant
          : revenuTotal * PENSION_TAUX_REMPLACEMENT_FALLBACK
        const epargnePension = pension - chargesEstimees
        const delta = epargnePension - epargneActuelle
        const yStart = Math.max(0, Math.min(horizon, yEvt))
        for (let y = yStart; y <= horizon; y++) {
          epargneDelta[y] = (epargneDelta[y] ?? 0) + delta
        }
        applied.push({
          id: evt.id, type: evt.type, yearOffset: yEvt,
          label: evt.label, montant: pension,
        })
        break
      }

      case 'naissance': {
        // -300 €/m × nb_enfants pendant 22 ans à partir de y_naissance.
        const meta = (evt.meta ?? {}) as { nb_enfants?: number }
        const nb = Math.max(1, Math.floor(meta.nb_enfants ?? 1))
        const yStart = Math.max(0, Math.min(horizon, yEvt))
        const yEnd   = Math.min(horizon, yStart + NAISSANCE_DUREE_PRISE_EN_CHARGE_ANS - 1)
        const delta  = -NAISSANCE_COUT_MENSUEL_EUR * nb
        for (let y = yStart; y <= yEnd; y++) {
          epargneDelta[y] = (epargneDelta[y] ?? 0) + delta
        }
        applied.push({
          id: evt.id, type: evt.type, yearOffset: yEvt,
          label: evt.label, montant: evt.montant,
        })
        break
      }

      case 'achat_rp': {
        // Réutilise le moteur AcquisitionFuture existant (cf. cadrage §2).
        // type='RP' déclenche un crédit + apport sorti, sans loyer (coût pur).
        const meta = (evt.meta ?? {}) as { apport?: number; mensualite?: number; duree_credit_annees?: number }
        const prix          = Number.isFinite(evt.montant ?? NaN) ? evt.montant! : 0
        const apport        = Math.max(0, meta.apport ?? 0)
        const dureeAns      = Math.max(1, meta.duree_credit_annees ?? 25)
        const yClamped      = Math.max(0, Math.min(horizon, yEvt))
        if (prix > 0) {
          acquisitions.push({
            id:                          `life-event-${evt.id}`,
            nom:                         evt.label ?? 'Résidence principale future',
            type:                        'RP',
            dans_combien_annees:         yClamped,
            prix_achat:                  prix,
            frais_notaire_pct:           7,
            apport,
            taux_interet:                3.5,
            duree_credit_ans:            dureeAns,
            loyer_brut_mensuel:          0,
            taux_vacance_pct:            0,
            charges_mensuelles:          0,
            appreciation_annuelle_pct:   2,
          })
        }
        applied.push({
          id: evt.id, type: evt.type, yearOffset: yEvt,
          label: evt.label, montant: evt.montant,
        })
        break
      }
    }
  }

  return {
    revenuPassifExceptionnelParAnnee: revenuExceptionnel,
    epargneDeltaParAnnee:             epargneDelta,
    acquisitionsFuturesFromEvents:    acquisitions,
    appliedEvents:                    applied,
  }
}

/**
 * Détecte si la liste d'évènements actifs CHANGE effectivement la
 * projection (au moins un vecteur non-nul ou une acquisition).
 * Utilisé par lifeEventsExplain pour décider d'afficher la transparence.
 */
export function hasActiveLifeEventImpact(v: LifeEventVectors): boolean {
  if (v.acquisitionsFuturesFromEvents.length > 0) return true
  if (v.revenuPassifExceptionnelParAnnee.some((x) => x !== 0)) return true
  if (v.epargneDeltaParAnnee.some((x) => x !== 0)) return true
  return false
}
