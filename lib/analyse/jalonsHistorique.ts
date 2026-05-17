/**
 * Marquage des jalons FIRE deja franchis par l'historique reel (Sprint 2 — I7).
 *
 * Avant : `projectionGlobale` retournait des jalons figes (100k, 500k, 1M)
 * basés sur la projection future, sans tenir compte du fait que l'utilisateur
 * ait peut-etre deja franchi 100k et 500k il y a 2 ans.
 *
 * Apres : on enrichit les jalons avec `atteint=true` + `date_atteinte` si
 * un snapshot passe a deja depasse le seuil. Les jalons qui sont desormais
 * derriere nous (depasses par le patrimoine actuel) ne sont PAS retires
 * automatiquement — on les marque pour permettre a l'UI de les afficher
 * comme "trophy" plutot que comme objectifs futurs.
 *
 * La fonction est pure et accepte un historique minimal (date + valeur),
 * compatible avec `WealthSnapshot` et `PortfolioSnapshot`.
 */

import type { JalonFIRE } from '@/types/analyse'

export interface WealthSnapshotLike {
  /** Date ISO (YYYY-MM-DD). */
  snapshot_date:   string
  /** Valeur du patrimoine net a cette date. */
  patrimoine_net:  number
}

export interface EnrichJalonsOptions {
  /** Si true, retire de la liste les jalons milestone deja atteints
   *  (ne reste que ceux a venir). FIRE et lean_fire ne sont jamais
   *  retires car ce sont les objectifs principaux. Defaut false. */
  retirerAtteints?: boolean
}

/**
 * Pour chaque jalon de type 'milestone', cherche le 1er snapshot dans
 * `historique` dont `patrimoine_net >= jalon.valeur`. Marque alors le jalon
 * `atteint=true` avec sa date.
 *
 * Les jalons d'autre type (fire, lean_fire, debt) ne sont pas modifies :
 * leur sens est l'age FUTUR ou la fin d'un credit, pas un seuil historique.
 */
export function enrichJalonsAvecHistorique(
  jalons:     ReadonlyArray<JalonFIRE>,
  historique: ReadonlyArray<WealthSnapshotLike>,
  opts:       EnrichJalonsOptions = {},
): JalonFIRE[] {
  // Tri chronologique pour identifier le 1er franchissement.
  const sortedHist = [...historique].sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  )

  const enriched: JalonFIRE[] = jalons.map((j) => {
    if (j.type !== 'milestone') return { ...j }
    const firstCross = sortedHist.find((s) => s.patrimoine_net >= j.valeur)
    if (firstCross) {
      return {
        ...j,
        atteint:       true,
        date_atteinte: firstCross.snapshot_date,
      }
    }
    return { ...j }
  })

  if (opts.retirerAtteints) {
    return enriched.filter((j) => j.type !== 'milestone' || !j.atteint)
  }
  return enriched
}
