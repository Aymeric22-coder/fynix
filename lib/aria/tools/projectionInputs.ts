/**
 * Construit les `ProjectionInputs` requis par `projectionGlobale` a partir
 * d'un `PatrimoineComplet`. Reutilise par plusieurs executors de tools
 * pour eviter de re-coder le mapping.
 *
 * Why: la fonction equivalente `computeProjectionSnapshot` est privee
 * dans `lib/analyse/aggregateur.ts`. On replique ici uniquement le
 * mapping des champs (pas la logique metier) — la formule canonique
 * (`projectionGlobale`, `swrPctFromFireType`) reste centralisee.
 *
 * Si le profil utilisateur est incomplet (age, age cible, revenu passif
 * cible), retourne null — le tool doit alors expliquer a l'utilisateur
 * de completer son profil.
 */

import type { PatrimoineComplet, ProjectionInputs } from '@/types/analyse'
import { swrPctFromFireType } from '@/lib/analyse/projectionFIRE'

export function buildProjectionInputs(
  p: PatrimoineComplet,
  overrides: Partial<ProjectionInputs> = {},
): ProjectionInputs | null {
  const age      = p.fireInputs.age
  const ageCible = p.fireInputs.age_cible
  const revenuPassifCible = p.fireInputs.revenu_passif_cible

  if (age === null || ageCible === null || revenuPassifCible <= 0) return null
  if (ageCible <= age) return null

  // fireType vit dans le profil etendu (cf. aggregateur.ts > loadProfile).
  // PatrimoineComplet ne l'expose pas directement ; on retombe sur le SWR
  // standard (4 %) si on ne peut pas l'inferer.
  const fireType = (p as unknown as { fireType?: string | null }).fireType ?? null
  const swrPct = swrPctFromFireType(fireType)

  // Le rendement central est calcule via PatrimoineComplet.rendementEstime
  // qui pondere immo + dividendes. C'est exactement ce que l'aggregateur
  // utilise comme rendementCentral.
  const rendementCentral = p.rendementEstime || 5

  return {
    ageActuel:                 age,
    ageCible:                  ageCible,
    revenuPassifCible:         revenuPassifCible,
    epargneMensuelle:          p.fireInputs.epargne_mensuelle ?? 0,
    rendementCentral,
    appreciationImmoPct:       2,
    inflationLoyersPct:        1.5,
    inflationPct:              2,
    swrPct,
    patrimoineFinancierActuel: p.totalPortefeuille,
    cashActuel:                p.totalCash,
    biensExistants:            p.biens,
    acquisitionsFutures:       [],
    horizonAnnees:             35,
    ...overrides,
  }
}
