/**
 * Tool : retourne le detail complet d'un bien immobilier (KPIs calcules
 * via `calculerKPIsBien` canonique).
 *
 * Recherche le bien par nom, ville ou id (insensible casse, partiel).
 */

import type { BienImmo, PatrimoineComplet } from '@/types/analyse'

export interface ObtenirDetailBienArgs {
  query: string
}

export interface BienDetail {
  id:                   string
  nom:                  string
  ville:                string | null
  type:                 string
  valeur:               number
  equity:               number
  credit_restant:       number
  mensualite_credit:    number
  loyer_mensuel:        number
  charges_annuelles:    number
  cashflow_mensuel:     number
  cashflow_net_fiscal:  number
  impot_mensuel_estime: number
  rendement_brut_pct:   number
  rendement_net_pct:    number
  ltv_pct:              number
  niveau_levier:        string
  risque_immo:          number
  fiscal_regime:        string | null
  donnees_completes:    boolean
}

export interface ObtenirDetailBienResult {
  query:   string
  found:   boolean
  bien?:   BienDetail
  /** Si plusieurs matchs, on en liste les noms pour que Claude puisse demander de preciser. */
  candidates_si_ambigu?: Array<{ id: string; nom: string; ville: string | null }>
}

function mapBien(b: BienImmo): BienDetail {
  return {
    id:                  b.id,
    nom:                 b.nom,
    ville:               b.ville,
    type:                b.type,
    valeur:              Math.round(b.valeur),
    equity:              Math.round(b.equity),
    credit_restant:      Math.round(b.credit_restant),
    mensualite_credit:   Math.round(b.mensualite_credit),
    loyer_mensuel:       Math.round(b.loyer_mensuel),
    charges_annuelles:   Math.round(b.charges_annuelles),
    cashflow_mensuel:    Math.round(b.cashflow_mensuel),
    cashflow_net_fiscal: Math.round(b.cashflow_net_fiscal),
    impot_mensuel_estime: Math.round(b.impot_mensuel_estime),
    rendement_brut_pct:  Math.round(b.rendement_brut * 100) / 100,
    rendement_net_pct:   Math.round(b.rendement_net * 100) / 100,
    ltv_pct:             Math.round(b.ltv * 10) / 10,
    niveau_levier:       b.niveau_levier,
    risque_immo:         Math.round(b.risque_immo),
    fiscal_regime:       b.fiscal_regime ?? null,
    donnees_completes:   b.donnees_completes,
  }
}

export async function executeObtenirDetailBien(
  p: PatrimoineComplet,
  args: ObtenirDetailBienArgs,
): Promise<ObtenirDetailBienResult> {
  const raw = String(args.query ?? '').trim().toLowerCase()
  if (!raw) {
    return {
      query: '',
      found: false,
      candidates_si_ambigu: p.biens.map((b) => ({ id: b.id, nom: b.nom, ville: b.ville })),
    }
  }

  const matches = p.biens.filter((b) => {
    const nom   = (b.nom ?? '').toLowerCase()
    const ville = (b.ville ?? '').toLowerCase()
    const id    = b.id.toLowerCase()
    return nom.includes(raw) || ville.includes(raw) || id === raw
  })

  if (matches.length === 0) return { query: args.query, found: false }
  if (matches.length === 1) return { query: args.query, found: true, bien: mapBien(matches[0]!) }

  return {
    query: args.query,
    found: false,
    candidates_si_ambigu: matches.map((b) => ({ id: b.id, nom: b.nom, ville: b.ville })),
  }
}
