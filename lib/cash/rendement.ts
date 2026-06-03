/**
 * Intérêts annuels et taux moyen pondéré du cash — helper pur (Cash V1.0).
 *
 * Référence audit : C7 (intérêts totaux non agrégés) et C8 (taux moyen
 * pondéré non calculé). Ces deux KPI sont actuellement absents de la
 * page `/cash`. Ce helper sera consommé en V1.1 par la page.
 *
 * Branchement applicatif unique en V1.0 : `lib/analyse/aggregateur.ts:742`
 * (fonction `rendementEstime`), où la contribution cash au rendement
 * pondéré utilise désormais ce taux réel plutôt que la constante 3 %.
 *
 * Conventions :
 *   - `interest_rate` en entrée est en % annuel (convention DB existante,
 *     cf. migration 001 : `cash_accounts.interest_rate NUMERIC(7,4)`).
 *   - `tauxMoyenPondereDecimal` en sortie est un décimal (0,0325 = 3,25 %).
 *   - `tauxMoyenPonderePourcent` en sortie est en %, arrondi 2 décimales.
 *   - Les comptes à taux 0 sont **inclus dans le dénominateur** (sinon
 *     un compte courant à 0 % gonflerait artificiellement le taux moyen).
 *   - Les devises non-EUR sont converties via `fxResolver` (défaut :
 *     `toEur` de `lib/providers/fx`).
 *   - Aucune dépendance à un statut pro, un salaire ou des charges :
 *     le rendement est purement mécanique.
 */

import { toEur as defaultToEur } from '@/lib/providers/fx'
import type { CurrencyCode } from '@/types/database.types'

export interface CashAccountForYield {
  /** Solde dans la devise locale du compte. */
  balance:       number
  /** ISO 4217 (`'EUR'`, `'USD'`, …). Insensible à la casse. */
  currency:      string
  /** Taux nominal annuel en %. Convention DB : `cash_accounts.interest_rate`. */
  interest_rate: number
}

export interface CashYieldResult {
  /** Σ (balance_eur × rate / 100). Arrondi au centime. */
  interetsAnnuelsTotalEur:  number
  /** Σ(balance_eur × rate_decimal) / Σ(balance_eur). Décimal non arrondi. */
  tauxMoyenPondereDecimal:  number
  /** Même chose × 100, arrondi 2 décimales. */
  tauxMoyenPonderePourcent: number
}

export type CashFxResolver = (amount: number, currency: string) => Promise<number>

const defaultFxResolver: CashFxResolver = async (amount, currency) => {
  const code = (currency ?? 'EUR').toUpperCase()
  if (code === 'EUR') return amount
  return defaultToEur(amount, code as CurrencyCode)
}

const ZERO: CashYieldResult = {
  interetsAnnuelsTotalEur:  0,
  tauxMoyenPondereDecimal:  0,
  tauxMoyenPonderePourcent: 0,
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Calcule les intérêts annuels totaux et le taux moyen pondéré du cash.
 *
 * Comportement :
 *   - `accounts` vide → retourne `ZERO`.
 *   - Σ balance_eur == 0 (tous comptes à solde 0, ou tous résolus NaN)
 *     → retourne `ZERO` (pas de division par zéro).
 *   - Les comptes dont le `interest_rate` n'est pas un nombre fini sont
 *     traités comme 0 % (mais leur solde reste dans le dénominateur,
 *     ce qui tire le taux moyen vers le bas — comportement attendu).
 */
export async function computeCashYield(
  accounts: CashAccountForYield[],
  fxResolver?: CashFxResolver,
): Promise<CashYieldResult> {
  if (accounts.length === 0) return { ...ZERO }

  const fx = fxResolver ?? defaultFxResolver

  let sumBalances = 0
  let sumWeighted = 0 // Σ (balance_eur × rate_decimal)

  for (const a of accounts) {
    const balEur = await fx(a.balance, a.currency)
    if (!Number.isFinite(balEur)) continue
    const rateRaw     = a.interest_rate
    const rateDecimal = Number.isFinite(rateRaw) ? rateRaw / 100 : 0
    sumBalances += balEur
    sumWeighted += balEur * rateDecimal
  }

  if (sumBalances === 0) return { ...ZERO }

  const tauxMoyenDecimal = sumWeighted / sumBalances

  return {
    interetsAnnuelsTotalEur:  round2(sumWeighted),
    tauxMoyenPondereDecimal:  tauxMoyenDecimal,
    tauxMoyenPonderePourcent: round2(tauxMoyenDecimal * 100),
  }
}
