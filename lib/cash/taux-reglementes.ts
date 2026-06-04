/**
 * Taux réglementés de l'épargne française (V1.4 Vol E).
 *
 * Single source of truth pour les défauts de taux dans le formulaire
 * d'ajout/édition de comptes cash. Évite la duplication et le risque de
 * désynchronisation observé en V1.0–V1.3 (les taux 3 %/4 %/2,25 % hardcodés
 * dans `add-cash-form.tsx` ne reflétaient plus les valeurs en vigueur).
 *
 * **Date d'effet : 1er février 2026** (source : Banque de France). Les
 * valeurs précédentes (1er août 2025) sont conservées en commentaire pour
 * traçabilité.
 *
 * À actualiser à chaque révision réglementaire (typiquement 1er février
 * et 1er août). Le PEL change uniquement pour les plans ouverts à partir
 * d'une date donnée — les plans antérieurs gardent leur taux d'origine.
 */

export type CashAccountType =
  | 'livret_a'
  | 'ldds'
  | 'lep'
  | 'livret_jeune'
  | 'pel'
  | 'cel'

export interface TauxReglemente {
  type:        CashAccountType
  tauxPercent: number
  /** ISO `YYYY-MM-DD`. Date d'effet du taux. */
  dateEffet:   string
  /** Libellé court de la source officielle. */
  source:      string
  /** Note libre (ex : « plans ouverts depuis le 1er janvier 2026 »). */
  note?:       string
}

/**
 * Taux en vigueur au 04 juin 2026.
 *
 * Historique récent pour mémoire :
 *   - 1er août 2025 : LA 1,7 % / LDDS 1,7 % / LEP 2,7 % / CEL 1,5 %
 *   - 1er février 2026 : valeurs ci-dessous (modération de la baisse,
 *     décision du Gouverneur de la Banque de France).
 */
export const TAUX_REGLEMENTES: readonly TauxReglemente[] = [
  { type: 'livret_a',     tauxPercent: 1.5, dateEffet: '2026-02-01', source: 'Banque de France' },
  { type: 'ldds',         tauxPercent: 1.5, dateEffet: '2026-02-01', source: 'Banque de France' },
  { type: 'lep',          tauxPercent: 2.5, dateEffet: '2026-02-01', source: 'Banque de France' },
  { type: 'cel',          tauxPercent: 1.0, dateEffet: '2026-02-01', source: 'Banque de France',
    note: '2/3 du taux du Livret A' },
  { type: 'livret_jeune', tauxPercent: 1.5, dateEffet: '2026-02-01', source: 'Banque de France',
    note: 'Minimum réglementaire ; chaque banque peut offrir mieux.' },
  { type: 'pel',          tauxPercent: 2.0, dateEffet: '2026-01-01', source: 'Réglementation PEL',
    note: 'Pour les plans ouverts à partir du 1er janvier 2026.' },
]

/**
 * Récupère le taux réglementé courant d'un type. Retourne `undefined`
 * pour `compte_courant`, `compte_epargne` et `other` (pas de taux légal).
 */
export function getTauxReglemente(
  type: string | null | undefined,
): TauxReglemente | undefined {
  if (!type) return undefined
  return TAUX_REGLEMENTES.find((t) => t.type === type)
}

/**
 * Mapping rétro-compat avec `add-cash-form.tsx` V1.0 → V1.3, qui consommait
 * un `Record<string, number>` (`DEFAULT_RATES`). On reconstruit la même
 * structure à partir de la source de vérité.
 *
 * Type `Record<string, number | undefined>` (et non `Record<CashAccountType, number>`)
 * pour permettre l'indexation directe par `e.target.value` côté form sans
 * cast — les types `'compte_courant'`/`'other'` retournent `undefined` ce
 * qui est le comportement attendu (pas de défaut suggéré).
 */
export const DEFAULT_RATES: Readonly<Record<string, number | undefined>> =
  Object.freeze(
    Object.fromEntries(TAUX_REGLEMENTES.map((t) => [t.type, t.tauxPercent])),
  ) as Readonly<Record<string, number | undefined>>
