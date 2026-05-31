/**
 * CS2 LOT 1 — Constantes crypto pour le modèle de croissance projection FIRE.
 *
 * Avant CS2, la crypto était EXCLUE du `calculerRendementPortefeuille`
 * (`projectionFIRE.ts:135` skip `asset_type === 'crypto'`) → un user avec
 * 30 % crypto voyait sa projection biaisée (taux moyen calculé uniquement
 * sur les 70 % restants). CS2 LOT 1 l'inclut avec un taux conservateur.
 *
 * Choix `CRYPTO_RENDEMENT_CENTRAL_PCT = 4 %` :
 *   - Volatilité crypto annuelle > 60 % historiquement (Bitcoin 2018-2025).
 *   - Rendement annualisé long terme BTC ~30 %/an (10 ans), mais largement
 *     non-réplicable sur un horizon FIRE 10-30 ans (cycles, dilution alts).
 *   - 4 % reflète une hypothèse PRUDENTE : on suppose que la crypto se
 *     comporte sur 30 ans comme un actif spéculatif décorrélé qui
 *     contribue marginalement au capital composé.
 *   - L'utilisateur expert qui veut un autre taux passera par les
 *     sliders /analyse (override local) — pas de persistance pour MVP.
 *
 * Seuil `CRYPTO_PART_SIGNIFICATIVE_PCT = 10 %` :
 *   - Si la crypto représente ≥ 10 % du patrimoine financier, on l'affiche
 *     dans le breakdown projection (`PatrimoineComplet.breakdown.crypto`)
 *     comme une catégorie distincte pour transparence UX.
 *   - En deça : intégrée silencieusement dans le calcul moyen.
 *
 * Évolution future possible : exposer un slider crypto dans /analyse
 * (« mon hypothèse perso pour la crypto »), persister en BDD si besoin.
 */

/**
 * Rendement central annuel appliqué à la part crypto du portefeuille
 * dans `calculerRendementPortefeuille`. Pourcentage entier.
 *
 * Conservateur (4 %) : on reconnaît la classe d'actif sans surestimer.
 */
export const CRYPTO_RENDEMENT_CENTRAL_PCT = 4

/**
 * Seuil au-delà duquel la part crypto est exposée comme une catégorie
 * distincte dans le breakdown patrimoine (visibilité utilisateur).
 */
export const CRYPTO_PART_SIGNIFICATIVE_PCT = 10
