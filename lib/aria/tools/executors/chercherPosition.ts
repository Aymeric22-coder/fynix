/**
 * Tool : recherche une position dans le portefeuille par nom / ticker / ISIN
 * (insensible casse, partiel). Retourne jusqu'a 5 correspondances.
 */

import type { EnrichedPosition, PatrimoineComplet } from '@/types/analyse'

export interface ChercherPositionArgs {
  query: string
}

export interface ChercherPositionMatch {
  isin:            string
  nom:             string
  classe:          string
  quantite:        number
  pru:             number
  valeur_actuelle: number
  pv_latente:      number
  pv_latente_pct:  number
  devise:          string
  poids_pct:       number
}

export interface ChercherPositionResult {
  query:    string
  nb_total: number
  matches:  ChercherPositionMatch[]
}

function mapPosition(pos: EnrichedPosition): ChercherPositionMatch {
  return {
    isin:            pos.isin,
    nom:             pos.name,
    classe:          pos.asset_type,
    quantite:        pos.quantity,
    pru:             pos.pru,
    valeur_actuelle: Math.round(pos.current_value),
    pv_latente:      Math.round(pos.gain_loss),
    pv_latente_pct:  Math.round(pos.gain_loss_pct * 10) / 10,
    devise:          pos.currency,
    poids_pct:       Math.round(pos.weight_in_portfolio * 10) / 10,
  }
}

export async function executeChercherPosition(
  p: PatrimoineComplet,
  args: ChercherPositionArgs,
): Promise<ChercherPositionResult> {
  const raw = String(args.query ?? '').trim().toLowerCase()
  if (!raw) return { query: '', nb_total: p.positions.length, matches: [] }

  const matches = p.positions.filter((pos) => {
    const name = (pos.name ?? '').toLowerCase()
    const isin = (pos.isin ?? '').toLowerCase()
    return name.includes(raw) || isin.includes(raw)
  })

  // Trier par valeur descendante, plafonner a 5.
  matches.sort((a, b) => b.current_value - a.current_value)
  return {
    query:    args.query,
    nb_total: matches.length,
    matches:  matches.slice(0, 5).map(mapPosition),
  }
}
