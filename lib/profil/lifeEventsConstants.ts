/**
 * CS5 — Source de vérité UNIQUE pour les évènements de vie.
 *
 * Tout le code consommateur (Step10 UI, buildLifeEventVectors,
 * lifeEventsExplain, tests, reset payload, route handlers) DOIT importer
 * ces constantes au lieu de redéclarer un literal `'/crypto/i'` ou un
 * `'retraite' as const` quelque part. Aucun string magique dans le code.
 *
 * 4 types MVP (CS5 phase 5a) :
 *   - `retraite`             — bascule revenu actif → pension
 *   - `capital_exceptionnel` — héritage / vente d'entreprise / autre
 *   - `achat_rp`             — acquisition future de résidence principale
 *   - `naissance`            — naissance ou adoption à venir
 *
 * Le type `capital_exceptionnel` est UNIFIÉ côté BDD ; le libellé libre
 * (`label`) permet à l'utilisateur de préciser "Héritage" / "Vente
 * d'entreprise" / "Autre". DB stocke `type='capital_exceptionnel'` + label.
 */

/** Identifiants stables, utilisés comme contrainte CHECK SQL et clés UI. */
export const LIFE_EVENT_TYPES = [
  'retraite',
  'capital_exceptionnel',
  'achat_rp',
  'naissance',
] as const

export type LifeEventType = typeof LIFE_EVENT_TYPES[number]

/** Libellés humains (fr). Utilisés dans Step10 UI, explainers, emails. */
export const LIFE_EVENT_LABELS: Readonly<Record<LifeEventType, string>> = {
  retraite:             'Retraite',
  capital_exceptionnel: 'Capital exceptionnel attendu',
  achat_rp:             'Achat de résidence principale',
  naissance:            'Naissance / adoption à venir',
}

/** Emoji par type — réutilisé dans ReferenceLine projection + emails. */
export const LIFE_EVENT_EMOJI: Readonly<Record<LifeEventType, string>> = {
  retraite:             '🏖',
  capital_exceptionnel: '💰',
  achat_rp:             '🏠',
  naissance:            '👶',
}

/**
 * Sous-catégories disponibles pour `capital_exceptionnel`.
 * UX-only : le type BDD reste `capital_exceptionnel`.
 */
export const CAPITAL_EXCEPTIONNEL_PRESETS = [
  { value: 'heritage',         label: 'Héritage' },
  { value: 'vente_entreprise', label: 'Vente d\'entreprise' },
  { value: 'autre',            label: 'Autre' },
] as const

export type CapitalExceptionnelPreset = typeof CAPITAL_EXCEPTIONNEL_PRESETS[number]['value']

/**
 * Statut "propriétaire RP" stocké sur `profiles.proprietaire_rp_status`.
 * Conditionne l'affichage du sous-bloc Achat RP dans Step10.
 */
export const PROPRIETAIRE_RP_STATUS_VALUES = [
  'oui_actuel',     // déjà propriétaire → bloc Achat RP masqué
  'non_prevu',      // pas propriétaire, achat prévu → bloc Achat RP affiché
  'non_pas_prevu',  // pas propriétaire, pas d'achat prévu → bloc Achat RP masqué
] as const

export type ProprietaireRpStatus = typeof PROPRIETAIRE_RP_STATUS_VALUES[number]

/**
 * Coût mensuel par enfant (€/mois) appliqué pendant 22 ans à partir de la
 * date de naissance. Aligné sur la constante QW9-bis pour rester cohérent
 * avec `adjustCibleFamille` (cf. dette refacto "cibleFamille time-bounded"
 * documentée dans le commit CS5).
 *
 * 22 ans = âge de fin de prise en charge légale (études supérieures
 * jusqu'à ~22 ans, INSEE).
 */
export const NAISSANCE_COUT_MENSUEL_EUR        = 300
export const NAISSANCE_DUREE_PRISE_EN_CHARGE_ANS = 22

/**
 * Taux de remplacement pension utilisé en fallback quand l'utilisateur ne
 * saisit pas la pension estimée. Heuristique INSEE moyenne salariés/cadres.
 */
export const PENSION_TAUX_REMPLACEMENT_FALLBACK = 0.5

/** Lien externe pour estimer sa pension précise (InfoTip Step 10 Retraite). */
export const INFO_RETRAITE_URL = 'https://www.info-retraite.fr/'

/**
 * Format de date : "YYYY-MM-01". La date occurrence est stockée en `date`
 * Postgres mais on n'utilise que mois + année. Le jour est posé à 01.
 */
export function lifeEventDateToYearMonth(date: string | null): { year: number | null; month: number | null } {
  if (!date) return { year: null, month: null }
  const [y, m] = date.split('-')
  const year  = y ? Number.parseInt(y, 10) : null
  const month = m ? Number.parseInt(m, 10) : null
  return {
    year:  year  !== null && Number.isFinite(year)  ? year  : null,
    month: month !== null && Number.isFinite(month) ? month : null,
  }
}

/**
 * Convertit un mois/année en delta d'années (fractionnaire arrondi) depuis
 * `today`. Utilisé par `buildLifeEventVectors` pour mapper sur l'index `y`
 * du moteur de projection (qui travaille en pas annuel).
 *
 * Décision arbitrée #6 : UI saisit MM/AAAA, engine raisonne en AAAA,
 * conversion = round((eventYear - todayYear) + (eventMonth - todayMonth)/12).
 * Le `Math.round` arrondit à l'année la plus proche — un évènement Jan 2031
 * vu depuis Jul 2026 = round(4.5) = 5.
 */
export function lifeEventYearsFromNow(
  occurrenceDate: string | null,
  now: Date = new Date(),
): number | null {
  const { year, month } = lifeEventDateToYearMonth(occurrenceDate)
  if (year === null) return null
  const m = month ?? 1
  const delta = (year - now.getFullYear()) + (m - (now.getMonth() + 1)) / 12
  return Math.round(delta)
}
