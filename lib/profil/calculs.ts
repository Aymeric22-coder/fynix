/**
 * Logique pure du questionnaire de profil investisseur.
 *
 * Aucune dépendance UI / Supabase ici : que des constantes (contenu des
 * étapes, questions, options, réponses correctes) et des fonctions pures
 * de calcul (score quiz, score global, simulation FIRE, type de profil,
 * axes d'amélioration). Tout est testable en isolation.
 *
 * Source de vérité du contenu : ProfilePreview.jsx fourni par l'utilisateur.
 * Le design est rebâti avec les tokens existants de l'app (cf. composants
 * dans components/profil/). Ici on n'importe pas une seule classe CSS.
 */

// QW9-bis — import du détail famille pour la projection ajustée (computeProfileMetrics).
// Le cycle est apparent uniquement (cibleFamille.ts importe des helpers et constantes
// de calculs.ts) : à l'exécution, les fonctions de cibleFamille ne sont appelées
// QUE depuis l'intérieur de computeProfileMetrics, donc après initialisation du
// module. Pas de TDZ.
import { adjustCibleFamilleDetail } from './cibleFamille'

// ───────────────────────────────────────────────────────────────────
// Constantes — méta des 8 étapes
// ───────────────────────────────────────────────────────────────────

export interface StepMeta {
  id:     number
  title:  string
  sub:    string
}

// Renumérotation post-CS10 : l'ordre des IDs SUIT l'ordre d'affichage du
// wizard. Plus de friction « Step9 = Fiscalité affichée en 4e position ».
// La migration SQL 051 a re-mappé les `wizard_step_completed` existants.
export const STEPS: ReadonlyArray<StepMeta> = [
  { id: 1,  title: 'Situation personnelle',     sub: 'Les bases de votre profil pour personnaliser toute votre expérience FIRECORE.' },
  { id: 2,  title: 'Revenus',                   sub: 'Vos revenus nets mensuels, toutes sources confondues.' },
  { id: 3,  title: 'Charges & Dépenses',        sub: 'Vos charges fixes et courantes pour calculer votre vrai reste à vivre.' },
  // CS1 — Fiscalité (anciennement ID 9, désormais ID 4 dans l'ordre visuel).
  { id: 4,  title: 'Ta fiscalité',              sub: 'Une dernière info pour calibrer précisément tes recos fiscales. Étape skippable.' },
  { id: 5,  title: 'Capacité d\'investissement', sub: 'Ce que vous pouvez réellement allouer chaque mois à votre patrimoine.' },
  { id: 6,  title: 'Quiz Bourse',               sub: '4 questions pour évaluer objectivement vos connaissances. Soyez honnête — c\'est pour mieux vous accompagner.' },
  { id: 7,  title: 'Quiz Crypto',               sub: '4 questions pour mesurer vos connaissances en cryptomonnaies.' },
  { id: 8,  title: 'Quiz Immobilier',           sub: '3 questions pour évaluer vos bases en investissement immobilier.' },
  { id: 9,  title: 'Profil de risque & FIRE',   sub: 'Comment réagissez-vous face à la volatilité, et quelle est votre vision de l\'indépendance financière ?' },
  // CS5 — Projets de vie (ID 10 inchangé, toujours la dernière étape).
  { id: 10, title: 'Tes projets de vie',        sub: 'Quelques dates futures pour personnaliser ta trajectoire FIRE. Étape skippable.' },
] as const

// ───────────────────────────────────────────────────────────────────
// Constantes — choix simples (chips)
// ───────────────────────────────────────────────────────────────────

export const SITUATIONS_FAMILIALES = ['Célibataire', 'En couple', 'Marié(e) / PACS', 'Autre'] as const
export const STATUTS_PRO           = ['Salarié', 'Indépendant / Freelance', 'Chef d\'entreprise', 'Retraité', 'Autre'] as const
export const ENFANTS               = ['0', '1', '2', '3', '4+'] as const
// V1.4 Vol F — Retrait de la mention « (CDI) » du chip : un indépendant
// long-terme ou un dirigeant à revenus historiquement réguliers peut
// légitimement se positionner « Très stables ». Le mapping
// `mapStabiliteToEnum` continue à retourner 'stable' sur ce libellé
// (basé sur le tag « stable », pas sur la mention CDI).
export const STABILITES_REVENUS    = ['Très stables', 'Stables mais variables', 'Irréguliers', 'Très variables'] as const
// CS5 dette — Source unique des chips Step 4 dans `enveloppesConstants.ts`.
// On re-exporte ici la liste de libellés pour rester compatible avec les
// consommateurs existants (Step4.tsx, ProfilCard, etc.). NE PAS éditer
// cette ligne — modifier ENVELOPPE_DEFS à la place.
import { ENVELOPPE_LABELS } from './enveloppesConstants'
export const ENVELOPPES            = ENVELOPPE_LABELS
export const PRIORITES             = ['Liberté de temps', 'Arrêter de travailler', 'Voyager', 'Transmettre un patrimoine', 'Sécurité famille'] as const

// ───────────────────────────────────────────────────────────────────
// Constantes — Quiz
// CS6 — La source unique vit dans `lib/profil/quizCatalog.ts`
// (id stable, tag concept, lesson micro-leçon). Cette section ne fait
// que ré-exporter les tableaux historiques (`QUIZ_BOURSE/CRYPTO/IMMO`)
// pour préserver la compatibilité des call-sites (Step5/6/7, scoring).
// NE PAS ré-ajouter des questions ici — éditer quizCatalog.ts.
// ───────────────────────────────────────────────────────────────────

export { QUIZ_CATALOG, getQuizQuestions, deriveMissedConcepts, deriveMissedConceptTags } from './quizCatalog'
export type { QuizQuestion, QuizDomain } from './quizCatalog'
import { QUIZ_CATALOG as _QUIZ_CATALOG } from './quizCatalog'
import type { QuizQuestion as _QuizQuestion } from './quizCatalog'

export const QUIZ_BOURSE: ReadonlyArray<_QuizQuestion> = _QUIZ_CATALOG.bourse
export const QUIZ_CRYPTO: ReadonlyArray<_QuizQuestion> = _QUIZ_CATALOG.crypto
export const QUIZ_IMMO:   ReadonlyArray<_QuizQuestion> = _QUIZ_CATALOG.immo

// ───────────────────────────────────────────────────────────────────
// Constantes — Questions de risque (étape 8)
// ───────────────────────────────────────────────────────────────────

export interface RiskQuestion {
  /** Clé dans la table profiles : risk_1..risk_4. */
  key:  'risk_1' | 'risk_2' | 'risk_3' | 'risk_4'
  q:    string
  opts: ReadonlyArray<{ v: string; l: string }>
}

export const RISK_QUESTIONS: ReadonlyArray<RiskQuestion> = [
  {
    key: 'risk_1',
    q:   'Si votre portefeuille perd 30 % en 3 mois, vous…',
    opts: [
      { v: 'Vendre',    l: 'Vendez tout pour stopper les pertes' },
      { v: 'Attendre',  l: 'Attendez patiemment que ça remonte' },
      { v: 'Renforcer', l: 'Profitez-en pour renforcer vos positions' },
    ],
  },
  {
    key: 'risk_2',
    q:   'Votre horizon d\'investissement principal est…',
    opts: [
      { v: '<3ans',    l: 'Moins de 3 ans' },
      { v: '3-7ans',   l: '3 à 7 ans' },
      { v: '7-15ans',  l: '7 à 15 ans' },
      { v: '>15ans',   l: 'Plus de 15 ans' },
    ],
  },
  {
    key: 'risk_3',
    q:   'Quel rendement annuel ciblez-vous ?',
    opts: [
      { v: '3-5%',   l: '3–5 % — Sécurité avant tout' },
      { v: '5-10%',  l: '5–10 % — Équilibre risque/rendement' },
      { v: '10-20%', l: '10–20 % — Croissance forte' },
      { v: '20%+',   l: '20 %+ — Performance maximale' },
    ],
  },
  {
    key: 'risk_4',
    q:   'Quelle part max de votre patrimoine acceptez-vous de risquer ?',
    opts: [
      { v: '<10%',   l: 'Moins de 10 %' },
      { v: '10-30%', l: '10 à 30 %' },
      { v: '30-60%', l: '30 à 60 %' },
      { v: '>60%',   l: 'Plus de 60 %' },
    ],
  },
] as const

// Mapping valeur → score 0-100 (cohérent avec la prise de risque).
// Ex : "Vendre" tout au moindre crash = profil très défensif → 0.
const RISK_VALUE_TO_SCORE: Record<'risk_1' | 'risk_2' | 'risk_3' | 'risk_4', Record<string, number>> = {
  risk_1: { Vendre:    0, Attendre: 40, Renforcer: 100 },
  risk_2: { '<3ans':   5, '3-7ans': 30, '7-15ans':  70, '>15ans': 100 },
  risk_3: { '3-5%':    5, '5-10%':  30, '10-20%':   70, '20%+':   100 },
  risk_4: { '<10%':    5, '10-30%': 30, '30-60%':   70, '>60%':   100 },
}

// ───────────────────────────────────────────────────────────────────
// Constantes — Types de FIRE
// ───────────────────────────────────────────────────────────────────

export interface FireTypeDef {
  id:   string
  name: string
  desc: string
}

export const FIRE_TYPES: ReadonlyArray<FireTypeDef> = [
  { id: 'lean',    name: 'Indépendance frugale',    desc: 'Frugalité maximale, liberté totale, budget minimal' },
  { id: 'classic', name: 'Indépendance équilibrée', desc: 'Train de vie raisonnable, dépenses sous contrôle' },
  { id: 'fat',     name: 'Indépendance confortable', desc: 'Liberté sans compromis, train de vie élevé' },
  { id: 'coast',   name: 'Indépendance autonome',   desc: 'Patrimoine qui fructifie seul jusqu\'à la retraite' },
  { id: 'barista', name: 'Indépendance partielle',  desc: 'Semi-retraite avec un petit revenu d\'activité plaisir' },
] as const

// ───────────────────────────────────────────────────────────────────
// Fonctions pures
// ───────────────────────────────────────────────────────────────────

/**
 * Compte le nombre de bonnes réponses à un quiz.
 * @param answers liste des index choisis (0..3). Une réponse absente compte 0.
 * @param quiz définition du quiz (questions + bonnes réponses)
 */
export function quizScore(
  answers: ReadonlyArray<number | null | undefined>,
  quiz:    ReadonlyArray<_QuizQuestion>,
): number {
  return quiz.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0)
}

export type QuizLevel = 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert'

export interface QuizLevelResult {
  label: QuizLevel
  /** Position pour la barre de progression (en %) — utilisée par l'UI. */
  pct:   number
  /** Variante visuelle pour le badge. */
  tone:  'danger' | 'warning' | 'info' | 'success'
}

/**
 * Détermine le niveau du quiz selon le ratio correct/total.
 *
 * Seuils : <26 % → Débutant, <51 % → Intermédiaire, <76 % → Avancé, sinon Expert.
 */
export function quizLevel(correct: number, total: number): QuizLevelResult {
  const ratio = total > 0 ? correct / total : 0
  if (ratio < 0.26) return { label: 'Débutant',      pct: 18, tone: 'danger' }
  if (ratio < 0.51) return { label: 'Intermédiaire', pct: 45, tone: 'warning' }
  if (ratio < 0.76) return { label: 'Avancé',        pct: 72, tone: 'info' }
  return { label: 'Expert', pct: 96, tone: 'success' }
}

/**
 * Score de risque global (0-100) à partir des 4 réponses comportementales.
 * Si une réponse manque, on neutralise à 50 pour ne pas pénaliser.
 */
export function riskScore(answers: {
  risk_1?: string | null
  risk_2?: string | null
  risk_3?: string | null
  risk_4?: string | null
}): number {
  const r1 = RISK_VALUE_TO_SCORE.risk_1[answers.risk_1 ?? ''] ?? 50
  const r2 = RISK_VALUE_TO_SCORE.risk_2[answers.risk_2 ?? ''] ?? 50
  const r3 = RISK_VALUE_TO_SCORE.risk_3[answers.risk_3 ?? ''] ?? 50
  const r4 = RISK_VALUE_TO_SCORE.risk_4[answers.risk_4 ?? ''] ?? 50
  return Math.round((r1 + r2 + r3 + r4) / 4)
}

/** CS3 R5 — pct attribué à un domaine quand l'utilisateur a cliqué
 *  « Je connais déjà — Expert » sur ce quiz.
 *
 *  Valeur = 67 ≈ round(96 × 0.7) où 96 est le pct du niveau Expert dans
 *  `quizLevel`. Strictement < 100 % (on ne déclare pas l'utilisateur Expert
 *  pur sans audit) ET > moyenne Débutant (18) / Intermédiaire (45) / Avancé
 *  (72) borderline — choix conservateur qui place l'utilisateur entre
 *  Avancé et Expert sans le ranker comme Expert pur.
 *
 *  → Tombe dans la fourchette "Avancé" du `quizLevel` (51-75 %), ce qui est
 *    sémantiquement correct : on lui accorde un bon niveau sans le sacrer. */
export const EXPERT_SELF_DECLARED_PCT = 67

/**
 * Score d'expérience (0-100) = moyenne pondérée des 3 quiz selon le pct
 * de niveau de chacun. Aligné sur la mécanique d'origine (ProfilePreview).
 *
 * CS3 R5 — Si `selfDeclaredDomains` contient le domaine, son pct est
 * remplacé par `EXPERT_SELF_DECLARED_PCT` (67). Permet à un utilisateur
 * de cliquer « Je connais déjà » sans répondre, et de voir son score
 * d'expérience refléter cette expertise auto-déclarée.
 */
export function experienceScore(quizzes: {
  bourse: { correct: number; total: number }
  crypto: { correct: number; total: number }
  immo:   { correct: number; total: number }
}, selfDeclaredDomains: ReadonlyArray<string> = []): number {
  const has = (d: ExpertDomain) => selfDeclaredDomains.includes(d)
  const pctOf = (d: ExpertDomain, lvl: QuizLevelResult): number =>
    has(d) ? EXPERT_SELF_DECLARED_PCT : lvl.pct
  const lB = quizLevel(quizzes.bourse.correct, quizzes.bourse.total)
  const lC = quizLevel(quizzes.crypto.correct, quizzes.crypto.total)
  const lI = quizLevel(quizzes.immo.correct,   quizzes.immo.total)
  return Math.round((pctOf('bourse', lB) + pctOf('crypto', lC) + pctOf('immo', lI)) / 3)
}

/**
 * Taux d'épargne (% des revenus). 0 si revenus nuls/négatifs.
 */
export function savingsRate(epargneMensuelle: number, revenuTotalMensuel: number): number {
  if (revenuTotalMensuel <= 0) return 0
  return Math.round((epargneMensuelle / revenuTotalMensuel) * 100)
}

/**
 * Score global investisseur (0-100), pondéré :
 *   35 % taux d'épargne (boosté ×2 : 50 % d'épargne = 100 pts)
 *   25 % risque
 *   40 % expérience (quiz)
 */
export function globalScore(parts: {
  savingsRatePct: number
  riskPct:        number
  experiencePct:  number
}): number {
  const savingsPct = Math.min(parts.savingsRatePct * 2, 100)
  return Math.round(savingsPct * 0.35 + parts.riskPct * 0.25 + parts.experiencePct * 0.40)
}

/**
 * Patrimoine cible FIRE = revenu passif mensuel × 12 × 25 (règle des 25x).
 * Default historique (SWR 4 %) — pour un calcul adapté au type FIRE
 * (lean / classic / fat / coast / barista), utiliser `fireTargetByType`.
 */
export function fireTarget(revenuPassifMensuelCible: number): number {
  return Math.max(0, revenuPassifMensuelCible) * 12 * 25
}

// ───────────────────────────────────────────────────────────────────
// Normalisation tolérante des champs profil (valeurs UI → ids stables)
// ───────────────────────────────────────────────────────────────────
//
// La DB stocke les libellés du wizard ("Très stables (CDI)", "Sécurité
// famille", "Marié(e) / PACS"...). Les calculs ont besoin d'ids stables.
// Ces normalizers font le mapping et tolèrent les deux formes (libellé UI
// ou id direct si la valeur a été persistée autrement).

/** CS3 R5 — Domaines disponibles pour l'auto-déclaration expert
 *  (bouton « Je connais déjà » sur Step 5/6/7). Aligne sur les 3 quiz. */
export type ExpertDomain        = 'bourse' | 'crypto' | 'immo'

export type FireTypeId          = 'lean' | 'classic' | 'fat' | 'coast' | 'barista'
export type StabiliteRevenusId  = 'cdi' | 'independant' | 'chomage' | 'retraite'
// QW4 — Buckets de priorité de vie. Remappés pour refléter fidèlement les
// 5 chips du wizard (étape 8) : chaque chip a maintenant un bucket dédié,
// au lieu de l'ancien collapse (Liberté/Arrêter/Voyager → equilibre,
// Transmettre → croissance, Sécurité famille → securite). Les anciens
// buckets 'securite' | 'croissance' | 'immo' sont SUPPRIMÉS (code mort :
// aucun chip ni code applicatif ne les produisait après remap).
export type PrioriteId          = 'equilibre' | 'transmission' | 'securite_famille' | 'independance'
export type SituationFamilialeId = 'celibataire' | 'couple' | 'marie' | 'pacse' | 'autre'

export function normalizeFireType(v: string | null | undefined): FireTypeId | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s.includes('lean'))    return 'lean'
  if (s.includes('classic')) return 'classic'
  if (s.includes('fat'))     return 'fat'
  if (s.includes('coast'))   return 'coast'
  if (s.includes('barista')) return 'barista'
  return null
}

export function normalizeStabiliteRevenus(v: string | null | undefined): StabiliteRevenusId | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  // Ordre : "stable" et "cdi" en premier pour que "Stables mais variables"
  // (qui contient les deux) soit classé "cdi" plutôt que "independant".
  if (s.includes('cdi') || s.includes('stable'))                         return 'cdi'
  if (s.includes('chômage') || s.includes('chomage'))                    return 'chomage'
  if (s.includes('retrait'))                                             return 'retraite'
  if (s.includes('indépendant') || s.includes('independant')
   || s.includes('freelance')   || s.includes('irrégul')
   || s.includes('irregul')     || s.includes('variable'))               return 'independant'
  return null
}

/**
 * QW2 — Dérive une stabilité de revenus DEFAUT depuis le statut professionnel.
 *
 * Fallback utilisé UNIQUEMENT quand l'utilisateur n'a pas renseigné
 * `stabilite_revenus` (l'étape 2 « Revenus » du wizard est skippable). Permet
 * au score Solidité d'appliquer l'ajustement de stabilité même sans saisie
 * explicite, à partir du statut_pro (étape 1, obligatoire).
 *
 * N'écrase JAMAIS une saisie explicite (le fallback ne s'active que sur null
 * côté aggregateur). Pure, sans effet de bord.
 *
 * Mapping volontairement restreint aux cas NON AMBIGUS :
 *   - Salarié                 → 'cdi'         (revenu régulier présumé)
 *   - Indépendant / Freelance → 'independant' (revenu variable présumé)
 *   - Retraité                → 'retraite'    (pension stable)
 *   - Chef d'entreprise       → null  (trop variable : dividendes, salaire mixte)
 *   - Autre / inconnu / vide  → null  (indéterminé)
 *
 * On ne devine pas pour les cas ambigus : mieux vaut un score neutre qu'un
 * ajustement potentiellement faux.
 */
export function deriveStabiliteFromStatutPro(
  statut_pro: string | null | undefined,
): StabiliteRevenusId | null {
  if (!statut_pro) return null
  const s = statut_pro.toLowerCase().trim()
  // "chef d'entreprise" NE doit PAS matcher independant/salarié → on le laisse
  // tomber dans le `return null` final (aucune branche ne le capture).
  if (s.includes('chef'))                                       return null
  if (s.includes('salarié') || s.includes('salarie'))           return 'cdi'
  if (s.includes('indépendant') || s.includes('independant')
   || s.includes('freelance'))                                  return 'independant'
  if (s.includes('retrait'))                                    return 'retraite'
  return null
}

export function normalizePriorite(v: string | null | undefined): PrioriteId | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  // QW4 — Mapping 1 chip → 1 bucket. Ordre important :
  //  - "Transmettre un patrimoine" testé AVANT toute branche contenant
  //    "patrimoine" (il n'y en a plus, mais on garde l'ordre défensif).
  //  - "Sécurité famille" : 'sécurité' OU 'famille'.
  //  - "Arrêter de travailler" → independance (objectif FIRE / cesser l'activité).
  //  - "Liberté de temps" / "Voyager" / "Équilibre" → equilibre (pas de biais).
  if (s.includes('transmet') || s.includes('transmission'))             return 'transmission'
  if (s.includes('sécurité') || s.includes('securite') || s.includes('famille')) return 'securite_famille'
  if (s.includes('arrêter')  || s.includes('arreter')
   || s.includes('indépendance') || s.includes('independance')
   || s.includes('travailler'))                                         return 'independance'
  if (s.includes('équilibre') || s.includes('equilibre')
   || s.includes('liberté')  || s.includes('liberte')
   || s.includes('voyager'))                                            return 'equilibre'
  return null
}

export function normalizeSituationFamiliale(v: string | null | undefined): SituationFamilialeId | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s.includes('célibataire') || s.includes('celibataire')) return 'celibataire'
  if (s.includes('pacs'))                                     return 'pacse'
  if (s.includes('marié') || s.includes('marie'))             return 'marie'
  if (s.includes('couple'))                                   return 'couple'
  if (s.includes('autre'))                                    return 'autre'
  return null
}

/** Convertit "0" / "1" / ... / "4+" en entier (4+ → 5). */
export function normalizeEnfants(v: string | null | undefined): number {
  if (!v) return 0
  const s = v.trim()
  if (s.includes('+')) return 5  // "4+" → 5
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ───────────────────────────────────────────────────────────────────
// FIRE adapté au type (SWR variable + Coast FIRE)
// ───────────────────────────────────────────────────────────────────

/**
 * Multiplicateur de capital cible selon le type FIRE (basé SWR) :
 *   - classic / barista → ×25    (SWR 4 % — règle de Trinity)
 *   - lean              → ×28.57 (SWR 3.5 % — patrimoine plus modeste, on
 *                                 prend un SWR plus prudent pour durer)
 *   - fat               → ×28.57 (SWR 3.5 % — confort élevé, dépenses
 *                                 sensibles à l'inflation, pérennité accrue)
 *   - coast             → ×25    (le multiplicateur de référence est
 *                                 classic, l'effet "coast" est appliqué
 *                                 par fireTargetByType)
 *   - null              → ×25 (défaut)
 */
export function swrMultiplier(fireType: string | null | undefined): number {
  const t = normalizeFireType(fireType)
  if (t === 'lean' || t === 'fat') return 1 / 0.035  // 28.571…
  return 25  // classic, barista, coast (base classic), null
}

/**
 * Capital cible FIRE selon le type :
 *   - lean / fat            : revenuPassif × 12 × 28.57 (SWR 3.5 %)
 *   - classic / barista     : revenuPassif × 12 × 25    (SWR 4 %)
 *   - coast                 : capital nécessaire AUJOURD'HUI pour atteindre
 *                             la cible classic à `ageCible` sans plus cotiser,
 *                             en supposant un rendement annuel composé.
 *
 * Si `age`/`ageCible` manquent pour 'coast', on retombe sur la cible classic.
 */
export function fireTargetByType(
  revenuPassifMensuelCible: number,
  fireType:     string | null | undefined,
  age?:         number | null,
  ageCible?:    number | null,
  annualReturn: number = 0.07,
): number {
  const t = normalizeFireType(fireType)
  const cibleAnnuelle = Math.max(0, revenuPassifMensuelCible) * 12

  if (t === 'coast') {
    const classicTarget = cibleAnnuelle * 25
    const n = (ageCible ?? 0) - (age ?? 0)
    if (n <= 0 || !isFinite(n)) return classicTarget
    return classicTarget / Math.pow(1 + annualReturn, n)
  }

  return cibleAnnuelle * swrMultiplier(t)
}

// ───────────────────────────────────────────────────────────────────
// Ajustement du revenu passif cible selon la composition du foyer
// ───────────────────────────────────────────────────────────────────

/** Coût mensuel moyen estimé d'un enfant à charge en France (INSEE 2023,
 *  ~3 600 €/an pour un enfant scolarisé sans frais exceptionnels).
 *  QW9-bis : exporté (additivement) pour réutilisation par lib/profil/cibleFamille.ts
 *  — source unique de constante. */
export const COUT_MENSUEL_PAR_ENFANT_EUR = 300

/** Quotient appliqué au revenu passif cible si l'utilisateur est en couple
 *  marié/pacsé SANS revenu conjoint déclaré : on suppose qu'il devra
 *  financer pour 2 personnes (+50 % de la cible saisie).
 *  QW9-bis : exporté (additivement) pour réutilisation par lib/profil/cibleFamille.ts. */
export const QUOTIENT_COUPLE_SANS_CONJOINT_REVENU = 0.5

/**
 * Delta mensuel à ADDITIONNER au `revenu_passif_cible` saisi pour refléter
 * la composition réelle du foyer.
 *
 * Règles :
 *   - +300 €/mois × nombre d'enfants (cap à 5)
 *   - +50 % de la cible saisie si situation marié/pacsé ET aucun revenu
 *     conjoint déclaré (le foyer aura besoin de financer 2 personnes)
 *
 * Hypothèse : si revenu_conjoint > 0, le conjoint contribue → pas de boost.
 */
export function adjustCibleFamille(p: Pick<ProfileInput,
  'enfants' | 'situation_familiale' | 'revenu_conjoint' | 'revenu_passif_cible'>): number {
  let delta = 0

  const nbEnfants = normalizeEnfants(p.enfants)
  if (nbEnfants > 0) delta += COUT_MENSUEL_PAR_ENFANT_EUR * nbEnfants

  const situ = normalizeSituationFamiliale(p.situation_familiale)
  const hasConjointRevenue = n(p.revenu_conjoint) > 0
  const isCoupleEngage = situ === 'marie' || situ === 'pacse'
  if (isCoupleEngage && !hasConjointRevenue) {
    delta += QUOTIENT_COUPLE_SANS_CONJOINT_REVENU * Math.max(0, n(p.revenu_passif_cible))
  }

  return Math.round(delta)
}

/**
 * Revenu passif mensuel cible AJUSTÉ à la composition du foyer.
 * = revenu_passif_cible saisi + adjustCibleFamille(profile)
 */
export function revenuPassifCibleAjuste(p: Pick<ProfileInput,
  'enfants' | 'situation_familiale' | 'revenu_conjoint' | 'revenu_passif_cible'>): number {
  return Math.max(0, n(p.revenu_passif_cible)) + adjustCibleFamille(p)
}

/**
 * Estimation du nombre d'années pour atteindre le patrimoine FIRE,
 * en supposant un rendement annualisé de 7 % (composé mensuellement)
 * et une contribution mensuelle fixe.
 *
 * @returns nombre d'années (peut être fractionnaire). 99 si impossible
 *   (contribution ≤ 0 ou cible ≤ 0).
 */
export function fireYears(
  monthlyContribution: number,
  targetCapital:       number,
  annualReturn:        number = 0.07,
): number {
  if (targetCapital <= 0 || monthlyContribution <= 0) return 99
  const r = annualReturn / 12
  let months = 0
  let capital = 0
  // Plafond 600 mois (50 ans) — au-delà on considère l'objectif inatteignable
  // dans un horizon de vie utile.
  while (capital < targetCapital && months < 600) {
    capital = capital * (1 + r) + monthlyContribution
    months++
  }
  return months / 12
}

export type ProfileType = 'Conservateur' | 'Équilibré' | 'Dynamique' | 'Offensif' | 'Stratège'

/**
 * Type de profil inféré depuis les scores risque + expérience.
 *   - Conservateur : risque < 30 ET expérience < 35
 *   - Offensif    : risque ≥ 70 ET expérience ≥ 65
 *   - Dynamique   : risque ≥ 55 (sinon)
 *   - Stratège    : expérience ≥ 70 (sinon)
 *   - Équilibré   : reste
 */
export function inferProfileType(riskPct: number, experiencePct: number): ProfileType {
  if (riskPct < 30 && experiencePct < 35) return 'Conservateur'
  if (riskPct >= 70 && experiencePct >= 65) return 'Offensif'
  if (riskPct >= 55) return 'Dynamique'
  if (experiencePct >= 70) return 'Stratège'
  return 'Équilibré'
}

/** Niveau de risque humain (libellé + tone) pour la jauge. */
export function riskLabel(riskPct: number): { label: string; tone: 'info' | 'success' | 'warning' | 'danger' } {
  if (riskPct < 30) return { label: 'Conservateur', tone: 'info' }
  if (riskPct < 55) return { label: 'Équilibré',    tone: 'success' }
  if (riskPct < 75) return { label: 'Dynamique',    tone: 'warning' }
  return { label: 'Offensif', tone: 'danger' }
}

/** Axe d'amélioration affichable. */
export interface Axe {
  icon:  string                       // emoji
  label: string
  /** 'good' = positif (badge vert), 'warn' = à améliorer (badge ambre). */
  tone:  'good' | 'warn'
}

/**
 * Calcule les axes d'amélioration à partir des métriques agrégées.
 * Retourne une liste ordonnée (positifs et négatifs mélangés selon contexte).
 */
export function computeAxes(input: {
  savingsRatePct: number
  bourseLevel:    QuizLevelResult
  cryptoLevel:    QuizLevelResult
  immoLevel:      QuizLevelResult
  fireYearsValue: number
}): Axe[] {
  const axes: Axe[] = []

  if (input.savingsRatePct < 15) {
    axes.push({ icon: '💸', label: `Taux d'épargne de ${input.savingsRatePct}% — visez 20% minimum`, tone: 'warn' })
  } else {
    axes.push({ icon: '✅', label: `Bon taux d'épargne : ${input.savingsRatePct}%`, tone: 'good' })
  }

  if (input.bourseLevel.pct < 50) axes.push({ icon: '📉', label: 'Connaissances bourse à approfondir', tone: 'warn' })
  if (input.cryptoLevel.pct < 50) axes.push({ icon: '₿',  label: 'Lacunes crypto à combler avant d\'investir', tone: 'warn' })
  if (input.immoLevel.pct   < 50) axes.push({ icon: '🏠', label: 'Bases immobilières insuffisantes — formez-vous', tone: 'warn' })

  if (input.bourseLevel.pct >= 70 && input.cryptoLevel.pct >= 70 && input.immoLevel.pct >= 70) {
    axes.push({ icon: '🎓', label: 'Maîtrise multi-actifs excellente', tone: 'good' })
  }

  if (input.fireYearsValue < 10) {
    axes.push({ icon: '🚀', label: 'Trajectoire FIRE très rapide !', tone: 'good' })
  } else if (input.fireYearsValue > 25 && input.fireYearsValue < 99) {
    axes.push({ icon: '⏳', label: 'Augmentez votre capacité d\'investissement mensuelle', tone: 'warn' })
  }

  return axes
}

// ───────────────────────────────────────────────────────────────────
// Agrégat : tous les chiffres dérivés d'un profil rempli.
// ───────────────────────────────────────────────────────────────────

export interface ProfileInput {
  age?:                  number | null
  prenom?:               string | null
  enfants?:              string | null
  situation_familiale?:  string | null
  statut_pro?:           string | null

  revenu_mensuel?:       number | null
  revenu_conjoint?:      number | null
  autres_revenus?:       number | null

  loyer?:                number | null
  autres_credits?:       number | null
  charges_fixes?:        number | null
  depenses_courantes?:   number | null

  epargne_mensuelle?:    number | null
  enveloppes?:           ReadonlyArray<string> | null

  quiz_bourse?:          ReadonlyArray<number> | null
  quiz_crypto?:          ReadonlyArray<number> | null
  quiz_immo?:            ReadonlyArray<number> | null

  risk_1?:               string | null
  risk_2?:               string | null
  risk_3?:               string | null
  risk_4?:               string | null
  fire_type?:            string | null
  revenu_passif_cible?:  number | null
  age_cible?:            number | null
  priorite?:             string | null
  /** CS3 R5 — Domaines auto-déclarés expert (Step 5/6/7 bouton « Je connais déjà »). */
  quiz_self_declared_domains?: ReadonlyArray<string> | null
}

export interface ProfileMetrics {
  revenusTotal:    number
  chargesTotal:    number
  resteAVivre:     number
  epargne:         number
  savingsRatePct:  number

  bourse:          { correct: number; total: number; level: QuizLevelResult }
  crypto:          { correct: number; total: number; level: QuizLevelResult }
  immo:            { correct: number; total: number; level: QuizLevelResult }

  riskPct:         number
  riskLabel:       { label: string; tone: 'info' | 'success' | 'warning' | 'danger' }
  experiencePct:   number
  globalPct:       number
  profileType:     ProfileType

  /** Cible patrimoine FIRE basée sur le revenu_passif_cible BRUT (legacy QW9).
   *  Conservée pour non-régression — la carte de profil affiche désormais
   *  les variantes `*Ajuste` quand `cibleFoyerDetail.hasAdjustment === true`. */
  fireTargetCapital: number
  fireYearsValue:    number   // peut valoir 99 si inatteignable
  fireAge:           number | null

  // ── QW9-bis — Variantes "ajustées composition du foyer" ─────────────
  // Calculées en REJOUANT la même projection interne (fireTarget + fireYears)
  // avec la cible AJUSTÉE. Aucune nouvelle logique : helper extrait, appelé 2×.
  // Si `cibleFoyerDetail.hasAdjustment === false`, les valeurs *Ajuste sont
  // identiques à leurs équivalents brut (garantie testable).

  /** Décomposition de l'ajustement famille (raisons, brut, ajusté). */
  cibleFoyerDetail:        import('./cibleFamille').CibleFoyerDetail
  /** Cible patrimoine FIRE calculée sur la cible €/mois AJUSTÉE. */
  fireTargetCapitalAjuste: number
  /** Années nécessaires (composition foyer prise en compte). */
  fireYearsValueAjuste:    number
  /** Âge d'indépendance (composition foyer prise en compte). */
  fireAgeAjuste:           number | null

  axes:            Axe[]
}

// `n` est hoisté en function declaration pour être accessible depuis les
// helpers définis plus tôt dans le fichier (normalizers, adjustCibleFamille…).
 
function n(v: number | null | undefined): number {
  return typeof v === 'number' && isFinite(v) ? v : 0
}

/**
 * QW9-bis — Helper privé behavior-preserving : exécute la projection
 * FIRE interne (fireTarget × fireYears × âge) sur UNE cible €/mois.
 *
 * Identique à la séquence inline historique du computeProfileMetrics legacy.
 * Extrait pour pouvoir l'appeler 2× (brut puis ajusté) SANS dupliquer la
 * logique. AUCUNE nouvelle règle métier.
 */
function _projectFireFromRevenuMensuel(
  revenuMensuelCible: number,
  epargne:            number,
  age:                number,
): { capital: number; yrs: number; ageFire: number | null } {
  const capital = fireTarget(revenuMensuelCible)
  const yrs     = fireYears(epargne, capital)
  const ageFire = age > 0 ? Math.round(age + yrs) : null
  return { capital, yrs, ageFire: yrs >= 99 ? null : ageFire }
}

/**
 * Calcule l'ensemble des métriques affichées sur la carte de profil.
 * Pure et synchrone — peut être exécutée en SSR ou côté client.
 */
export function computeProfileMetrics(p: ProfileInput): ProfileMetrics {
  const revenus = n(p.revenu_mensuel) + n(p.revenu_conjoint) + n(p.autres_revenus)
  const charges = n(p.loyer) + n(p.autres_credits) + n(p.charges_fixes) + n(p.depenses_courantes)
  const epargne = n(p.epargne_mensuelle)
  const sr      = savingsRate(epargne, revenus)

  const bCorrect = quizScore(p.quiz_bourse ?? [], QUIZ_BOURSE)
  const cCorrect = quizScore(p.quiz_crypto ?? [], QUIZ_CRYPTO)
  const iCorrect = quizScore(p.quiz_immo   ?? [], QUIZ_IMMO)

  const bourse = { correct: bCorrect, total: QUIZ_BOURSE.length, level: quizLevel(bCorrect, QUIZ_BOURSE.length) }
  const crypto = { correct: cCorrect, total: QUIZ_CRYPTO.length, level: quizLevel(cCorrect, QUIZ_CRYPTO.length) }
  const immo   = { correct: iCorrect, total: QUIZ_IMMO.length,   level: quizLevel(iCorrect, QUIZ_IMMO.length)   }

  const exp = experienceScore({
    bourse: { correct: bCorrect, total: QUIZ_BOURSE.length },
    crypto: { correct: cCorrect, total: QUIZ_CRYPTO.length },
    immo:   { correct: iCorrect, total: QUIZ_IMMO.length },
  }, p.quiz_self_declared_domains ?? [])
  const risk  = riskScore({ risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4 })
  const total = globalScore({ savingsRatePct: sr, riskPct: risk, experiencePct: exp })

  // ── Projection BRUTE — séquence legacy, INCHANGÉE bit pour bit ───────
  const ageNum  = n(p.age)
  const brutCible = n(p.revenu_passif_cible)
  const cible = fireTarget(brutCible)
  const yrs   = fireYears(epargne, cible)
  const age   = ageNum > 0 ? Math.round(ageNum + yrs) : null

  // ── QW9-bis — Projection AJUSTÉE (rejoue la même projection interne) ─
  //    Sur cible AJUSTÉE = brut + adjustCibleFamille(p) (legacy strict).
  //    `adjustCibleFamilleDetail` est importé en TOP-LEVEL (cf. en haut du
  //    fichier) — pas de cycle réel : cibleFamille n'utilise calculs que
  //    pour des constantes et des helpers déjà initialisés au moment où
  //    sa propre fonction est appelée.
  //    Helper extrait `_projectFireFromRevenuMensuel` = 0 nouvelle logique.
  const cibleFoyerDetail = adjustCibleFamilleDetail(p)
  const projAjuste = _projectFireFromRevenuMensuel(cibleFoyerDetail.ajuste, epargne, ageNum)

  return {
    revenusTotal:    revenus,
    chargesTotal:    charges,
    resteAVivre:     revenus - charges,
    epargne,
    savingsRatePct:  sr,

    bourse, crypto, immo,

    riskPct:       risk,
    riskLabel:     riskLabel(risk),
    experiencePct: exp,
    globalPct:     total,
    profileType:   inferProfileType(risk, exp),

    fireTargetCapital: cible,
    fireYearsValue:    yrs,
    fireAge:           yrs >= 99 ? null : age,

    // QW9-bis — variantes foyer ajusté (rendues côté ProfilCard quand hasAdjustment)
    cibleFoyerDetail,
    fireTargetCapitalAjuste: projAjuste.capital,
    fireYearsValueAjuste:    projAjuste.yrs,
    fireAgeAjuste:           projAjuste.ageFire,

    axes: computeAxes({
      savingsRatePct: sr,
      bourseLevel:    bourse.level,
      cryptoLevel:    crypto.level,
      immoLevel:      immo.level,
      fireYearsValue: yrs,
    }),
  }
}

