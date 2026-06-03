/**
 * Total cash unifié — helper pur destiné à remplacer à terme les 4
 * implémentations divergentes identifiées dans `auditcash.md` (C3, C4, C5, C6).
 *
 * Cette V1.0 fournit uniquement le helper, **sans brancher les call-sites
 * existants** (la page `/cash`, l'API `/api/cash`, l'aggregateur et le
 * pipeline Dashboard continuent de calculer leur total). Le branchement
 * progressif est planifié pour V1.1 / V1.2.
 *
 * Conventions :
 *   - Tous les montants en sortie sont en EUR, arrondis au centime.
 *   - La conversion FX est déléguée à `options.fxResolver`. Par défaut,
 *     `toEur` de `lib/providers/fx` est utilisé (cache mémoire → DB →
 *     API Frankfurter). En test, fournir un resolver synchrone-déguisé.
 *   - La dédup vis-à-vis des `assets` cash legacy se fait sur `asset_id`.
 *   - `account_type === 'compte_courant'` alimente `totalCompteCourantEur`
 *     et est exclu de `totalInvestissableEur` (cf. CS2 LOT 2).
 */

import { toEur as defaultToEur } from '@/lib/providers/fx'
import type { CurrencyCode } from '@/types/database.types'

export interface CashAccountForTotal {
  id:           string
  /** UUID de l'`assets` lié. Utilisé pour la dédup vs `legacyAssets`. */
  asset_id:     string | null
  /** Solde dans la devise locale du compte. */
  balance:      number
  /** ISO 4217 (`'EUR'`, `'USD'`, …). Insensible à la casse. */
  currency:     string
  /** Discriminant pour le split `compte_courant` vs reste. */
  account_type: string
}

export interface LegacyCashAsset {
  /** UUID de l'`assets`. La présence dans `accounts[].asset_id` désactive l'inclusion. */
  id:            string
  current_value: number
  currency:      string
}

export interface CashTotalsResult {
  /** Tous comptes confondus (livrets + courant + legacy non dédupliqués), en EUR. */
  totalEur:              number
  /** Exclut `account_type === 'compte_courant'`. Les legacy sont inclus. */
  totalInvestissableEur: number
  /** Uniquement `account_type === 'compte_courant'`. */
  totalCompteCourantEur: number
  /** Nombre de comptes effectivement comptés (post-dédup legacy). */
  countAccounts:         number
}

/** Resolver FX. Reçoit un montant + sa devise locale, retourne le montant EUR. */
export type CashFxResolver = (amount: number, currency: string) => Promise<number>

/**
 * Resolver par défaut : identité pour EUR (insensible à la casse),
 * sinon délègue à `toEur` du provider FX standard.
 */
const defaultFxResolver: CashFxResolver = async (amount, currency) => {
  const code = (currency ?? 'EUR').toUpperCase()
  if (code === 'EUR') return amount
  return defaultToEur(amount, code as CurrencyCode)
}

const round2 = (n: number): number => Math.round(n * 100) / 100

const EMPTY: CashTotalsResult = {
  totalEur:              0,
  totalInvestissableEur: 0,
  totalCompteCourantEur: 0,
  countAccounts:         0,
}

/**
 * Calcule les totaux cash unifiés. Pure (à `fxResolver` près).
 *
 * Comportement :
 *   - Aucun compte ni legacy → retourne `EMPTY`.
 *   - Chaque `account` est converti en EUR, additionné à `totalEur`,
 *     ventilé selon `account_type` (compte_courant vs investissable).
 *   - Chaque `legacyAsset` est :
 *       - SKIPPÉ si son `id` figure dans un `account.asset_id` (dédup).
 *       - Sinon converti en EUR et ajouté à `totalEur` ET
 *         `totalInvestissableEur` (un legacy n'a pas de `account_type`,
 *         on l'assimile à de l'épargne par défaut).
 *   - Arrondi au centime UNIQUEMENT en sortie, jamais sur les intermédiaires.
 */
export async function computeCashTotals(
  accounts: CashAccountForTotal[],
  options?: {
    legacyAssets?: LegacyCashAsset[]
    fxResolver?:   CashFxResolver
  },
): Promise<CashTotalsResult> {
  const legacy = options?.legacyAssets ?? []
  if (accounts.length === 0 && legacy.length === 0) return { ...EMPTY }

  const fx = options?.fxResolver ?? defaultFxResolver

  let totalEur              = 0
  let totalInvestissableEur = 0
  let totalCompteCourantEur = 0

  for (const a of accounts) {
    const eur = await fx(a.balance, a.currency)
    if (!Number.isFinite(eur)) continue
    totalEur += eur
    if (a.account_type === 'compte_courant') {
      totalCompteCourantEur += eur
    } else {
      totalInvestissableEur += eur
    }
  }

  const coveredAssetIds = new Set<string>(
    accounts
      .map((a) => a.asset_id)
      .filter((id): id is string => id !== null && id.length > 0),
  )

  let legacyCount = 0
  for (const l of legacy) {
    if (coveredAssetIds.has(l.id)) continue
    const eur = await fx(l.current_value, l.currency)
    if (!Number.isFinite(eur)) continue
    totalEur += eur
    totalInvestissableEur += eur
    legacyCount++
  }

  return {
    totalEur:              round2(totalEur),
    totalInvestissableEur: round2(totalInvestissableEur),
    totalCompteCourantEur: round2(totalCompteCourantEur),
    countAccounts:         accounts.length + legacyCount,
  }
}

/**
 * Variante synchrone — assume EUR pour toutes les balances.
 *
 * Existe pour les call-sites qui ne peuvent pas être rendus `async` sans
 * propager le mot-clé à toute leur chaîne d'appel (en pratique : le
 * pipeline Dashboard `computeDashboardData`, consommé en sync par
 * `app/(app)/dashboard/page.tsx` et par 30+ tests). Le pipeline V2.1-BIS
 * documente déjà cette hypothèse (« on suppose EUR pour V2.1-BIS, la
 * conversion FX patrimoniale viendra plus tard si besoin »).
 *
 * Comportement strictement identique à `computeCashTotals(accounts, {
 * legacyAssets, fxResolver: (a) => a })` mais sans le coût d'un microtask
 * await par compte. Pour les call-sites multi-devise réels, utiliser la
 * version `async`.
 */
export function computeCashTotalsSync(
  accounts: CashAccountForTotal[],
  options?: { legacyAssets?: LegacyCashAsset[] },
): CashTotalsResult {
  const legacy = options?.legacyAssets ?? []
  if (accounts.length === 0 && legacy.length === 0) return { ...EMPTY }

  const numOrZero = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined) return 0
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : 0
  }

  let totalEur              = 0
  let totalInvestissableEur = 0
  let totalCompteCourantEur = 0

  for (const a of accounts) {
    const eur = numOrZero(a.balance)
    totalEur += eur
    if (a.account_type === 'compte_courant') {
      totalCompteCourantEur += eur
    } else {
      totalInvestissableEur += eur
    }
  }

  const coveredAssetIds = new Set<string>(
    accounts
      .map((a) => a.asset_id)
      .filter((id): id is string => id !== null && id.length > 0),
  )

  let legacyCount = 0
  for (const l of legacy) {
    if (coveredAssetIds.has(l.id)) continue
    const eur = numOrZero(l.current_value)
    totalEur += eur
    totalInvestissableEur += eur
    legacyCount++
  }

  return {
    totalEur:              round2(totalEur),
    totalInvestissableEur: round2(totalInvestissableEur),
    totalCompteCourantEur: round2(totalCompteCourantEur),
    countAccounts:         accounts.length + legacyCount,
  }
}
