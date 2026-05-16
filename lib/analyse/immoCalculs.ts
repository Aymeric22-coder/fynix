/**
 * Calculs immobiliers purs (sans I/O) pour l'analyse patrimoniale.
 *
 * Calcule pour chaque bien : equity, LTV, rendements brut/net, cashflow
 * mensuel net, et un coefficient de risque (0-75) tenant compte du
 * levier et de l'auto-financement. Permet ensuite de pondérer le risque
 * immobilier dans les scores globaux (cohérence profil, solidité).
 *
 * Tous les champs d'entrée sont tolérants au manquant (defaults à 0) —
 * un bien sans crédit (payé cash) = `credit_restant=0, mensualite=0`.
 * Un bien sans charges détaillées = `charges_annuelles=0` (rendement
 * net = brut).
 */

export interface BienImmoInput {
  /** Valeur marché estimée (€). */
  valeur:             number
  /** Capital restant dû du crédit (€). 0 si payé cash. */
  credit_restant:     number
  /** Mensualité de crédit (capital + intérêts + assurance, €/mois). 0 si pas de crédit. */
  mensualite_credit:  number
  /** Loyer mensuel brut perçu (€/mois). 0 si RP ou vacant. */
  loyer_mensuel:      number
  /** Somme annuelle des charges réelles (taxe foncière, copro, assurance PNO, gestion…). */
  charges_annuelles:  number
  /** Type de bien (utilisé pour l'affichage : 'RP', 'Locatif', 'SCPI'…). */
  type?:              string
}

export interface BienImmoKPIs {
  equity:             number   // valeur − credit_restant
  ltv:                number   // 0-100, capital_restant / valeur × 100
  rendement_brut:     number   // % annuel, loyers × 12 / valeur × 100
  rendement_net:      number   // % annuel, (loyers × 12 − charges) / valeur × 100
  cashflow_mensuel:   number   // loyer − mensualité − charges/12 (peut être négatif)
  niveau_levier:      'Sans crédit' | 'Faible' | 'Modéré' | 'Fort'
  risque_immo:        number   // 15-85 (LTV + bonus cashflow négatif)
  /** True si données suffisantes (au moins valeur > 0). */
  donnees_completes:  boolean
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/**
 * Calcule les KPIs d'un bien immobilier à partir de ses paramètres.
 *
 *   - LTV = credit_restant / valeur × 100
 *   - Rendement brut = (loyer × 12) / valeur × 100
 *   - Rendement net  = (loyer × 12 − charges_annuelles) / valeur × 100
 *   - Cashflow       = loyer − mensualité − (charges_annuelles / 12)
 *
 *   - Risque base = 30 (immo physique = actif stable)
 *     + ajustement LTV : >80=+25, 60-80=+15, 40-60=+8, <40=+0
 *     + ajustement cashflow : <0=+10 (risque liquidité), >0=−5 (autofinancé)
 *     capé à 75 (≠ crypto 95)
 */
export function calculerKPIsBien(bien: BienImmoInput): BienImmoKPIs {
  const valeur            = Math.max(0, bien.valeur)
  const creditRestant     = Math.max(0, bien.credit_restant)
  const mensualite        = Math.max(0, bien.mensualite_credit)
  const loyer             = Math.max(0, bien.loyer_mensuel)
  const charges           = Math.max(0, bien.charges_annuelles)

  if (valeur <= 0) {
    return {
      equity: 0, ltv: 0, rendement_brut: 0, rendement_net: 0,
      cashflow_mensuel: 0, niveau_levier: 'Sans crédit',
      risque_immo: 30, donnees_completes: false,
    }
  }

  const equity         = valeur - creditRestant
  const ltv            = (creditRestant / valeur) * 100
  const loyersAnnuels  = loyer * 12
  const rendementBrut  = (loyersAnnuels / valeur) * 100
  const rendementNet   = ((loyersAnnuels - charges) / valeur) * 100
  const cashflow       = loyer - mensualite - charges / 12

  // Niveau de levier (libellé humain)
  const niveau: BienImmoKPIs['niveau_levier'] =
    creditRestant === 0 ? 'Sans crédit' :
    ltv >= 75           ? 'Fort'        :
    ltv >= 60           ? 'Modéré'      :
                          'Faible'

  // Score de risque — Phase 10 : recalibré pour refléter le levier réel.
  // L'immobilier à fort levier (LTV > 75 %) est une stratégie OFFENSIVE,
  // pas prudente. L'ancien plafond 75 sous-estimait cet effet.
  //
  // Table directe (remplace base 30 + ajustements) :
  //   LTV = 0   → 15   (immo cash = stable défensif)
  //   LTV < 40  → 20
  //   LTV 40-60 → 35
  //   LTV 60-75 → 50
  //   LTV ≥ 75  → 65
  //   + 10 si cashflow < 0 (effort mensuel assumé = prise de risque)
  let risque: number
  if      (creditRestant === 0) risque = 15
  else if (ltv < 40)            risque = 20
  else if (ltv < 60)            risque = 35
  else if (ltv < 75)            risque = 50
  else                          risque = 65
  if (cashflow < 0)             risque += 10
  risque = clamp(risque, 0, 85)

  return {
    equity,
    ltv,
    rendement_brut: rendementBrut,
    rendement_net:  rendementNet,
    cashflow_mensuel: cashflow,
    niveau_levier:  niveau,
    risque_immo:    risque,
    donnees_completes: true,
  }
}

/**
 * Calcule le risque moyen pondéré (par valeur) sur tous les biens.
 * Renvoie 30 (risque de base) si le portefeuille immo est vide.
 */
export function calculerRisqueImmoGlobal(
  biens: ReadonlyArray<{ valeur: number; risque_immo: number }>,
): number {
  const totalValeur = biens.reduce((s, b) => s + b.valeur, 0)
  if (totalValeur <= 0) return 30
  const sumPondere = biens.reduce((s, b) => s + b.valeur * b.risque_immo, 0)
  return Math.round(sumPondere / totalValeur)
}

/**
 * Somme des cashflows mensuels des biens LOCATIFS uniquement.
 * Cette valeur peut être négative (effort d'épargne mensuel sur un bien
 * récemment acheté avec levier fort).
 */
export function calculerRevenuPassifImmo(
  biens: ReadonlyArray<{ type?: string; cashflow_mensuel: number }>,
): number {
  // RP (résidence principale) exclue du revenu passif : pas de loyers.
  return biens
    .filter((b) => (b.type ?? '').toLowerCase() !== 'résidence principale'
                && (b.type ?? '').toLowerCase() !== 'rp')
    .reduce((s, b) => s + b.cashflow_mensuel, 0)
}

/**
 * Rendement net moyen pondéré (par valeur) du parc immo.
 */
export function rendementNetMoyenPondere(
  biens: ReadonlyArray<{ valeur: number; rendement_net: number }>,
): number {
  const total = biens.reduce((s, b) => s + b.valeur, 0)
  if (total <= 0) return 0
  return biens.reduce((s, b) => s + (b.valeur / total) * b.rendement_net, 0)
}
