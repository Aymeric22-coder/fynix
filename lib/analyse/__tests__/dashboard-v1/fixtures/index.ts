/**
 * Index des fixtures Dashboard V1.
 *
 * Toutes les fixtures représentent les 6 profils audités en Phase 2 du rapport
 * `auditdashboard.md`. Elles servent de double cliquet :
 *
 *   1. **Caractérisation** : `dashboard-caracterisation.test.ts` réplique les
 *      formules actuelles du Dashboard et vérifie qu'elles produisent bien
 *      les `currentBuggy.*` (capture l'état actuel, bugs compris).
 *
 *   2. **Cible** : les futurs tests d'unité (Annexe A — patrimoineBrutMV,
 *      topConsolide, allocationTaxonomie, etc.) consommeront `expected.*`
 *      pour valider que la refonte P0 donne les bons chiffres.
 */
import type { DashboardFixture } from './types'

import { DEBUTANT_FIXTURE }              from './debutant.fixture'
import { INVESTISSEUR_IMMO_FIXTURE }     from './investisseur-immo.fixture'
import { INVESTISSEUR_BOURSIER_FIXTURE } from './investisseur-boursier.fixture'
import { PATRIMOINE_DIVERSIFIE_FIXTURE } from './patrimoine-diversifie.fixture'
import { PRERETRAITE_FIXTURE }           from './preretraite.fixture'
import { HNW_COMPLEXE_FIXTURE }          from './hnw-complexe.fixture'

export {
  DEBUTANT_FIXTURE,
  INVESTISSEUR_IMMO_FIXTURE,
  INVESTISSEUR_BOURSIER_FIXTURE,
  PATRIMOINE_DIVERSIFIE_FIXTURE,
  PRERETRAITE_FIXTURE,
  HNW_COMPLEXE_FIXTURE,
}

/** Tous les profils, dans l'ordre du rapport Phase 2. */
export const ALL_FIXTURES: readonly DashboardFixture[] = [
  DEBUTANT_FIXTURE,
  INVESTISSEUR_IMMO_FIXTURE,
  INVESTISSEUR_BOURSIER_FIXTURE,
  PATRIMOINE_DIVERSIFIE_FIXTURE,
  PRERETRAITE_FIXTURE,
  HNW_COMPLEXE_FIXTURE,
]

export type { DashboardFixture } from './types'
