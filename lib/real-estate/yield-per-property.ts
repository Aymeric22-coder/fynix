/**
 * Rendement annualisé par bien immobilier (V2.4 P0.7 ST2).
 *
 * Fournit un rendement net-net (« netNetYield ») par bien pour alimenter
 * la zone Champions / Casseroles (Z8.5) côté catégorie « Immobilier ».
 *
 * **Source du rendement** : `PropertySimResult.simulation.kpis.netNetYield`
 * (cf. `lib/real-estate/types.ts:297`). Cette métrique correspond au
 * cash-flow après impôt + capital remboursé année 1 divisé par le coût
 * total d'opération — déjà exprimée en % annuel.
 *
 * **Pourquoi pas un TWR immobilier ?**
 *   L'immobilier est valorisé sur estimation utilisateur (pas de prix
 *   coté quotidien) → un TWR n'aurait pas de sens. Le netNetYield est
 *   la métrique de référence pour ranker la rentabilité d'un bien.
 *
 * **Pureté** : aucun I/O. Le filtre `minHoldingDays` exclut les biens
 * acquis depuis moins de N jours (défaut 90 j) — biais statistique
 * identique au TWR.
 */

/** Sous-ensemble du `PropertySimResult` consommé par ce moteur. */
export interface PropertyForYield {
  propertyId:        string
  propertyLabel:     string
  /** `netNetYield` en %, annuel par construction. */
  netNetYieldPct:    number
  /** Date d'acquisition (ISO `YYYY-MM-DD`). `null` = inconnue → exclu. */
  acquisitionDate:   string | null
  /** Vrai si la simulation a tourné avec des données incomplètes. */
  incompleteData:    boolean
}

export interface PropertyYieldResult {
  propertyId:        string
  propertyLabel:     string
  /** Rendement net-net annualisé en % (positif = gain). */
  netNetYieldPct:    number
  /** Jours de détention depuis `acquisitionDate` jusqu'à `asOfDate`. */
  holdingDays:       number
  /**
   * `extrapole` = `false` par construction : `netNetYield` est un KPI
   * modèle (année 1 projetée), pas un rendement historique extrapolé.
   * Conservé dans la sortie pour cohérence d'interface avec les autres
   * catégories du ranking V2.4.
   */
  extrapole:         boolean
  /** Hérité de la simulation (cf. PropertySimResult). */
  incompleteData:    boolean
}

export interface ComputeYieldPerPropertyInput {
  properties:       PropertyForYield[]
  asOfDate:         Date
  /** Seuil minimum d'ancienneté pour figurer au classement (défaut 90 j). */
  minHoldingDays?:  number
}

const DEFAULT_MIN_HOLDING_DAYS = 90
const DAY_MS = 86_400_000

/**
 * Calcule le rendement annualisé par bien immobilier. Les biens dont
 * `acquisitionDate` est manquante ou dont l'ancienneté est inférieure
 * à `minHoldingDays` sont exclus du retour.
 */
export function computeYieldPerProperty(
  input: ComputeYieldPerPropertyInput,
): PropertyYieldResult[] {
  const minDays = input.minHoldingDays ?? DEFAULT_MIN_HOLDING_DAYS
  const asOfMs  = input.asOfDate.getTime()

  const results: PropertyYieldResult[] = []
  for (const p of input.properties) {
    if (!p.acquisitionDate) continue
    const acqMs = new Date(p.acquisitionDate).getTime()
    if (!Number.isFinite(acqMs)) continue
    const holdingDays = Math.round((asOfMs - acqMs) / DAY_MS)
    if (holdingDays < minDays) continue
    if (!Number.isFinite(p.netNetYieldPct)) continue

    results.push({
      propertyId:     p.propertyId,
      propertyLabel:  p.propertyLabel,
      netNetYieldPct: p.netNetYieldPct,
      holdingDays,
      extrapole:      false,
      incompleteData: p.incompleteData,
    })
  }
  return results
}
