/**
 * Prélèvements sociaux (PS) et PFU par catégorie de revenu et par année.
 *
 * Source unique des taux de PS du moteur immobilier : aucun littéral 17,2 /
 * 18,6 ne doit exister ailleurs dans `lib/real-estate/`.
 *
 * Références légales :
 *  - LFSS 2026 : loi n° 2025-1403 du 30 décembre 2025, art. 12 — hausse de
 *    la CSG sur les revenus du patrimoine et produits de placement de
 *    9,2 % à 10,6 % (PS globaux 17,2 % → 18,6 %).
 *  - Art. L136-8 IV du Code de la sécurité sociale : dérogation maintenant
 *    la CSG à 9,2 % (PS 17,2 %) pour les revenus fonciers et les
 *    plus-values immobilières.
 *
 * Règles retenues :
 *  - foncier_nu           : 17,2 % toutes années ;
 *  - plus_value_immo      : 17,2 % toutes années ;
 *  - bic_meuble_non_pro   : 17,2 % avant 2025, 18,6 % à partir des revenus 2025 ;
 *  - dividendes_placement : 17,2 % avant 2026, 18,6 % à partir de 2026.
 *
 * Les BIC professionnels (LMP) relèvent des cotisations sociales (SSI), pas
 * de ce mécanisme : ils ne sont pas couverts ici.
 *
 * ⚠️ À faire valider par un professionnel avant usage commercial.
 *
 * Mise à jour annuelle : ajouter une règle (fromYear) à la table et avancer
 * `ANNEE_FISCALE_REFERENCE`.
 */

export type CategorieRevenuPS =
  | 'foncier_nu'
  | 'plus_value_immo'
  | 'bic_meuble_non_pro'
  | 'dividendes_placement'

/**
 * Année fiscale de référence, utilisée par défaut partout où aucune année de
 * revenus n'est disponible. À mettre à jour chaque année avec les barèmes.
 * Ne jamais dériver un taux de `new Date()`.
 */
export const ANNEE_FISCALE_REFERENCE = 2026

/** Taux PS historique (CSG 9,2 %), en %. */
export const TAUX_PS_HISTORIQUE_PCT = 17.2
/** Taux PS LFSS 2026 (CSG 10,6 %) sur les revenus du patrimoine / placements, en %. */
export const TAUX_PS_LFSS_2026_PCT = 18.6
/** Part impôt sur le revenu du PFU (inchangée), en %. */
export const TAUX_PFU_IR_PCT = 12.8

interface RegleTaux {
  /** Première année de revenus à laquelle le taux s'applique. */
  fromYear: number
  /** Taux en %. */
  tauxPct:  number
}

/** Règles triées par `fromYear` croissant ; la première a fromYear = -Infinity. */
const REGLES_PS: Readonly<Record<CategorieRevenuPS, readonly RegleTaux[]>> = {
  foncier_nu: [
    { fromYear: -Infinity, tauxPct: TAUX_PS_HISTORIQUE_PCT },
  ],
  plus_value_immo: [
    { fromYear: -Infinity, tauxPct: TAUX_PS_HISTORIQUE_PCT },
  ],
  bic_meuble_non_pro: [
    { fromYear: -Infinity, tauxPct: TAUX_PS_HISTORIQUE_PCT },
    { fromYear: 2025,      tauxPct: TAUX_PS_LFSS_2026_PCT },
  ],
  dividendes_placement: [
    { fromYear: -Infinity, tauxPct: TAUX_PS_HISTORIQUE_PCT },
    { fromYear: 2026,      tauxPct: TAUX_PS_LFSS_2026_PCT },
  ],
}

/**
 * Taux de prélèvements sociaux (en %) applicable à une catégorie de revenu
 * pour une année de revenus donnée.
 */
export function getTauxPrelevementsSociaux(
  categorie:    CategorieRevenuPS,
  anneeRevenus: number,
): number {
  const regles = REGLES_PS[categorie]
  let taux = regles[0]!.tauxPct
  for (const r of regles) {
    if (anneeRevenus >= r.fromYear) taux = r.tauxPct
  }
  return taux
}

/**
 * Taux global du PFU (en %) sur les dividendes et produits de placement :
 * 12,8 % d'IR + PS de la catégorie `dividendes_placement`.
 * 2025 → 30 % ; 2026 → 31,4 %.
 */
export function getTauxPfu(anneeRevenus: number): number {
  // Arrondi au centième : évite 31.400000000000002 (somme flottante).
  return Math.round((TAUX_PFU_IR_PCT + getTauxPrelevementsSociaux('dividendes_placement', anneeRevenus)) * 100) / 100
}
