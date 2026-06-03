/**
 * `computeChargesMensuelles` — Helper pur (V1.1-PATCH).
 *
 * Source unique de vérité pour la somme mensuelle des charges déclarées
 * dans le wizard Profil (étape 3 « Charges & dépenses »).
 *
 * Schéma DB : les charges sont stockées dans 4 colonnes distinctes de la
 * table `profiles` (migration 015) — il n'existe PAS de colonne
 * `charges_mensuelles` agrégée :
 *   - `loyer`              : loyer ou mensualité résidence principale
 *   - `autres_credits`     : crédits hors immo (conso, étudiant, …)
 *   - `charges_fixes`      : abonnements, assurances, énergie…
 *   - `depenses_courantes` : alimentaire, transport, loisirs…
 *
 * Comportement :
 *   - Somme les 4 sous-postes (null/undefined comptés comme 0).
 *   - Retourne 0 si tous nuls ; les call-sites traitent eux-mêmes la
 *     conversion `0 → null` selon leur sémantique (cf. getProfileContext
 *     qui expose `null` quand aucune charge n'est déclarée).
 *
 * Réutilisé par `getProfileContext` (lecture page `/cash`) et par
 * `loadProfile` (aggregateur, cf. aggregateur.ts:496, où la même somme
 * est calculée). À terme, l'aggregateur devrait aussi consommer ce
 * helper pour garantir la cohérence (hors scope V1.1-PATCH).
 */

export interface ProfileChargesRow {
  loyer:              number | string | null | undefined
  autres_credits:     number | string | null | undefined
  charges_fixes:      number | string | null | undefined
  depenses_courantes: number | string | null | undefined
}

/** Coercition silencieuse : null/undefined/NaN/négatif → 0. */
function safeNonNegative(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Somme les 4 sous-postes de charges du wizard Profil.
 * Retourne 0 si tous nuls / absents. Aucune exception possible.
 */
export function computeChargesMensuelles(row: ProfileChargesRow): number {
  return (
    safeNonNegative(row.loyer)
    + safeNonNegative(row.autres_credits)
    + safeNonNegative(row.charges_fixes)
    + safeNonNegative(row.depenses_courantes)
  )
}
