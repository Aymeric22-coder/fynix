/**
 * Taux nominal annualisé par compte cash (V2.4 P0.7 ST3).
 *
 * Fournit le taux d'intérêt annuel par compte d'épargne pour alimenter
 * la zone Champions / Casseroles (Z8.5) côté catégorie « Cash ».
 *
 * **Source du taux** : `cash_accounts.interest_rate` (cf. migration 001,
 * « taux en vigueur en % », type NUMERIC(7,4)). Déjà exprimé en % annuel.
 *
 * **Pourquoi pas un TWR cash ?**
 *   Les livrets ne sont pas cotés — leur rentabilité est strictement le
 *   taux contractuel. Un TWR sur historique des soldes ne refléterait que
 *   les versements / retraits, pas la performance intrinsèque.
 *
 * **Pureté** : aucun I/O. Le filtre `minHoldingDays` exclut les comptes
 * ouverts depuis moins de N jours (défaut 90 j) pour cohérence inter-classes.
 */

/** Sous-ensemble du `cash_accounts` consommé par ce moteur. */
export interface CashAccountForRate {
  accountId:        string
  accountLabel:     string
  /** Taux d'intérêt nominal annuel en %. */
  interestRatePct:  number
  /** Date d'ouverture du compte (ISO `YYYY-MM-DD` ou ISO datetime). */
  createdAt:        string
  /** Solde courant (€) — info indicative, pas utilisée pour ranker. */
  balance:          number
}

export interface CashRateResult {
  accountId:        string
  accountLabel:     string
  /** Taux annualisé en % (positif = gain). */
  interestRatePct:  number
  /** Jours d'ancienneté depuis `createdAt`. */
  holdingDays:      number
  /**
   * `extrapole` = `false` par construction : le taux est contractuel,
   * pas un rendement back-computé. Conservé pour cohérence d'interface
   * avec les autres catégories du ranking V2.4.
   */
  extrapole:        boolean
  /** Solde courant (info indicative). */
  balance:          number
}

export interface ComputeRatePerAccountInput {
  accounts:        CashAccountForRate[]
  asOfDate:        Date
  /** Seuil minimum d'ancienneté pour figurer au classement (défaut 90 j). */
  minHoldingDays?: number
}

const DEFAULT_MIN_HOLDING_DAYS = 90
const DAY_MS = 86_400_000

/**
 * Calcule le taux nominal annualisé par compte cash. Les comptes ouverts
 * depuis moins de `minHoldingDays` sont exclus du retour.
 */
export function computeRatePerAccount(
  input: ComputeRatePerAccountInput,
): CashRateResult[] {
  const minDays = input.minHoldingDays ?? DEFAULT_MIN_HOLDING_DAYS
  const asOfMs  = input.asOfDate.getTime()

  const results: CashRateResult[] = []
  for (const a of input.accounts) {
    if (!a.createdAt) continue
    const createdMs = new Date(a.createdAt).getTime()
    if (!Number.isFinite(createdMs)) continue
    const holdingDays = Math.round((asOfMs - createdMs) / DAY_MS)
    if (holdingDays < minDays) continue
    if (!Number.isFinite(a.interestRatePct)) continue

    results.push({
      accountId:       a.accountId,
      accountLabel:    a.accountLabel,
      interestRatePct: a.interestRatePct,
      holdingDays,
      extrapole:       false,
      balance:         a.balance,
    })
  }
  return results
}
