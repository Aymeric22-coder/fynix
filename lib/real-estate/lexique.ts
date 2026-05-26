/**
 * V9.1 — Lexique des indicateurs financiers immobiliers (FRICTION-001).
 *
 * Source unique de vérité pour les bulles d'aide (InfoTip) affichées à côté
 * de chaque indicateur dans l'UI immo. Modifier ici ⇒ se propage partout
 * (Synthèse, Rentabilité, bandeau /immobilier, cards portfolio, what-if,
 * crédit, simulateur).
 *
 * Pas de React. Pas de UI. Pure data + getter contextuel.
 */

export type LexiqueKey =
  | 'grossYield'
  | 'netYield'
  | 'netNetYield'
  | 'monthlyCashFlow'
  | 'latentGain'
  | 'remainingCapital'
  | 'apr'
  | 'deferral'
  | 'vacancy'

/**
 * Définitions courtes (1 phrase + 1 contexte). Validées par le produit.
 * Texte volontairement sans jargon, lisible en bulle au survol.
 */
const DEFINITIONS: Record<LexiqueKey, string> = {
  grossYield:
    "Rendement brut : loyers annuels ÷ coût total d'acquisition (prix + frais + travaux). Ce que rapporte le bien avant toute charge — utile pour comparer vite, mais optimiste.",
  netYield:
    "Rendement net : le brut moins les charges d'exploitation (taxe foncière, gestion, assurances, copropriété, entretien). Avant impôt et avant crédit.",
  netNetYield:
    "Rendement net-net : le net moins l'impôt réellement payé. La seule différence avec le net, c'est l'impôt — il n'inclut PAS le coût du crédit (ça apparaît dans le cash-flow). Quand l'impôt est faible (ex. amortissement en SCI à l'IS), net-net ≈ net.",
  monthlyCashFlow:
    "Cash-flow mensuel (après impôts) : ce qu'il reste réellement en poche chaque mois une fois tout payé — charges, mensualité de crédit ET impôt. C'est ici qu'apparaît le coût du financement.",
  latentGain:
    "Plus-value latente : écart entre la valeur actuelle estimée et le coût total d'acquisition. Un gain « sur le papier », pas réalisé tant qu'on n'a pas vendu.",
  remainingCapital:
    "Capital restant dû (CRD) : le capital qu'il reste à rembourser sur le(s) crédit(s) à un instant donné.",
  apr:
    "TAEG : le coût total du crédit en % annuel, intérêts + assurance + frais inclus.",
  deferral:
    "Différé : période en début de prêt où l'on ne rembourse pas le capital (total) ou seulement les intérêts (partiel).",
  vacancy:
    "Vacance : mois sans locataire, donc sans loyer.",
}

/**
 * Suffixe spécifique régime SCI à l'IS pour net-net.
 * (Le rendement net-net est calculé après IS au niveau de la société, donc
 * avant la flat tax / barème + PS qui frappe le dividende distribué.)
 */
const SCI_IS_NET_NET_SUFFIX =
  " Calculé après IS, avant la fiscalité de distribution aux associés."

/**
 * Récupère la définition d'un indicateur, en appliquant les variantes
 * contextuelles connues.
 *
 * Variantes actuelles :
 *  - `netNetYield` + `fiscalRegime === 'sci_is'`  →  ajoute le suffixe SCI IS.
 *
 * Les autres indicateurs ignorent `fiscalRegime` aujourd'hui. Le paramètre
 * est conservé sur la signature pour faciliter l'ajout de variantes futures
 * sans casser l'appelant.
 */
export function getLexiqueDefinition(
  key:           LexiqueKey,
  fiscalRegime?: string | null,
): string {
  const base = DEFINITIONS[key]
  if (key === 'netNetYield' && fiscalRegime === 'sci_is') {
    return base + SCI_IS_NET_NET_SUFFIX
  }
  return base
}

/**
 * Accès direct (sans variante contextuelle) pour les composants qui n'ont
 * pas de régime en scope (ex. bandeau portfolio agrégé).
 */
export const LEXIQUE: Readonly<Record<LexiqueKey, string>> = DEFINITIONS
