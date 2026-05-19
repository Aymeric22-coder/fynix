/**
 * Détection des biens sous-loués (loyer actuel < loyer de marché).
 *
 * Pure fonction utilisable côté serveur (page détail / dashboard insights)
 * comme côté client (carte alerte).
 */

export interface UnderRentLot {
  id:              string
  name:            string
  rent_amount:     number | null
  market_rent:     number | null
}

export interface UnderRentAlert {
  lotId:          string
  lotName:        string
  currentRent:    number
  marketRent:     number
  /** marketRent - currentRent, en €/mois. Toujours positif. */
  deltaEur:       number
  /** deltaEur / marketRent × 100, en %. */
  deltaPct:       number
  /** deltaEur × 12, en €. */
  annualLoss:     number
  /** < 5 % : low | 5–15 % : medium | > 15 % : high */
  severity:       'low' | 'medium' | 'high'
}

/**
 * Retourne la liste des lots sous-loués, triée par manque à gagner annuel
 * décroissant. Un lot sans `market_rent` ou sans `rent_amount` est ignoré.
 */
export function detectUnderRentAlerts(lots: UnderRentLot[]): UnderRentAlert[] {
  return lots
    .filter(lot =>
      lot.market_rent != null &&
      lot.rent_amount != null &&
      lot.market_rent > lot.rent_amount,
    )
    .map(lot => {
      const currentRent = lot.rent_amount!
      const marketRent  = lot.market_rent!
      const deltaEur    = marketRent - currentRent
      const deltaPct    = (deltaEur / marketRent) * 100
      const severity: 'low' | 'medium' | 'high' =
        deltaPct < 5 ? 'low' :
        deltaPct < 15 ? 'medium' : 'high'
      return {
        lotId:       lot.id,
        lotName:     lot.name,
        currentRent,
        marketRent,
        deltaEur,
        deltaPct,
        annualLoss:  deltaEur * 12,
        severity,
      }
    })
    .sort((a, b) => b.annualLoss - a.annualLoss)
}
