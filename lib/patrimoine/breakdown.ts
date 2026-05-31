/**
 * CS2 LOT 6 — Helper `breakdownPatrimoine` réutilisable.
 *
 * Expose une vue stable du patrimoine pour les consommateurs aval qui
 * n'ont pas besoin de toute la richesse de `PatrimoineComplet` mais
 * juste d'une décomposition par grande classe :
 *   - cash (livrets + comptes investissables, hors compte courant)
 *   - financialMarket (positions equity/etf/bonds/scpi/metal)
 *   - crypto (positions asset_type === 'crypto')
 *   - realEstateNet (immo brut - dettes immo)
 *
 * Pure, déterministe, dérivé strictement de `PatrimoineComplet`. Pattern
 * miroir des autres helpers atomiques (`enveloppesConstants`,
 * `lifeEventsConstants`, etc.).
 */

import type { PatrimoineComplet } from '@/types/analyse'

export interface PatrimoineBreakdown {
  /** Cash investissable (hors comptes courants — cf. CS2 LOT 2). */
  cash:            number
  /** Cash brut (tous les comptes/livrets, y compris compte courant). */
  cashBrut:        number
  /** Positions hors crypto (equity/etf/bonds/scpi/metal). */
  financialMarket: number
  /** Positions asset_type === 'crypto'. */
  crypto:          number
  /** Équity immobilière nette (valeur brute - capital restant dû). */
  realEstateNet:   number
  /** Total = cash investissable + financial market + crypto + real estate net. */
  total:           number
  /** Détails secondaires utiles à certains consommateurs. */
  detail: {
    /** Valeur brute immobilière (avant dettes). */
    realEstateGross: number
    /** Total dettes (crédits immo + autres). */
    debts:           number
    /** Part crypto en % du patrimoine financier (positions + cash). */
    cryptoPctFinancier: number
  }
}

/**
 * Dérive un breakdown stable depuis un `PatrimoineComplet`. Aucun fetch DB,
 * pas d'I/O — pur transform.
 */
export function breakdownPatrimoine(p: PatrimoineComplet): PatrimoineBreakdown {
  // Décomposition positions : crypto vs reste du portefeuille financier.
  let crypto = 0
  let financialMarket = 0
  for (const pos of p.positions) {
    if (pos.asset_type === 'crypto') crypto += pos.current_value
    else                              financialMarket += pos.current_value
  }

  const cash       = p.totalCashInvestissable
  const cashBrut   = p.totalCash
  const realEstate = p.totalImmoEquity

  const total = cash + financialMarket + crypto + realEstate

  // Part crypto en % du patrimoine financier (= cash investissable +
  // positions). Sert au seuil CRYPTO_PART_SIGNIFICATIVE_PCT (10 %).
  const denomFinancier = cash + financialMarket + crypto
  const cryptoPctFinancier = denomFinancier > 0
    ? Math.round((crypto / denomFinancier) * 1000) / 10
    : 0

  return {
    cash,
    cashBrut,
    financialMarket,
    crypto,
    realEstateNet:   realEstate,
    total,
    detail: {
      realEstateGross:   p.totalImmo,
      debts:             p.totalDettes,
      cryptoPctFinancier,
    },
  }
}
