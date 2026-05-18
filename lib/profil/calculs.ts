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

// ───────────────────────────────────────────────────────────────────
// Constantes — méta des 8 étapes
// ───────────────────────────────────────────────────────────────────

export interface StepMeta {
  id:     number
  title:  string
  sub:    string
}

export const STEPS: ReadonlyArray<StepMeta> = [
  { id: 1, title: 'Situation personnelle',     sub: 'Les bases de votre profil pour personnaliser toute votre expérience Fynix.' },
  { id: 2, title: 'Revenus',                   sub: 'Vos revenus nets mensuels, toutes sources confondues.' },
  { id: 3, title: 'Charges & Dépenses',        sub: 'Vos charges fixes et courantes pour calculer votre vrai reste à vivre.' },
  { id: 4, title: 'Capacité d\'investissement', sub: 'Ce que vous pouvez réellement allouer chaque mois à votre patrimoine.' },
  { id: 5, title: 'Quiz Bourse',               sub: '4 questions pour évaluer objectivement vos connaissances. Soyez honnête — c\'est pour mieux vous accompagner.' },
  { id: 6, title: 'Quiz Crypto',               sub: '4 questions pour mesurer vos connaissances en cryptomonnaies.' },
  { id: 7, title: 'Quiz Immobilier',           sub: '3 questions pour évaluer vos bases en investissement immobilier.' },
  { id: 8, title: 'Profil de risque & FIRE',   sub: 'Comment réagissez-vous face à la volatilité, et quelle est votre vision de l\'indépendance financière ?' },
] as const

// ───────────────────────────────────────────────────────────────────
// Constantes — choix simples (chips)
// ───────────────────────────────────────────────────────────────────

export const SITUATIONS_FAMILIALES = ['Célibataire', 'En couple', 'Marié(e) / PACS', 'Autre'] as const
export const STATUTS_PRO           = ['Salarié', 'Indépendant / Freelance', 'Chef d\'entreprise', 'Retraité', 'Autre'] as const
export const ENFANTS               = ['0', '1', '2', '3', '4+'] as const
export const STABILITES_REVENUS    = ['Très stables (CDI)', 'Stables mais variables', 'Irréguliers', 'Très variables'] as const
export const ENVELOPPES            = ['PEA', 'Assurance-vie', 'CTO', 'PER', 'Livret A', 'LDDS', 'CEL / PEL', 'Aucune'] as const
export const PRIORITES             = ['Liberté de temps', 'Arrêter de travailler', 'Voyager', 'Transmettre un patrimoine', 'Sécurité famille'] as const

// ───────────────────────────────────────────────────────────────────
// Constantes — Quiz
// Chaque question : libellé, 4 options, index de la bonne réponse.
// ───────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  q:    string
  opts: ReadonlyArray<string>
  ans:  number
}

export const QUIZ_BOURSE: ReadonlyArray<QuizQuestion> = [
  {
    q: 'Qu\'est-ce qu\'un ETF ?',
    opts: [
      'Un fonds indiciel coté en bourse qui réplique la performance d\'un indice',
      'Une action d\'une seule entreprise cotée en bourse',
      'Un produit d\'épargne garanti et réglementé par l\'État',
      'Une obligation émise par une entreprise pour se financer',
    ],
    ans: 0,
  },
  {
    q: 'Que mesure le PER (Price to Earnings Ratio) d\'une action ?',
    opts: [
      'La volatilité historique d\'une action sur douze mois',
      'La valorisation d\'une action rapportée à ses bénéfices annuels',
      'Le rendement des dividendes versés aux actionnaires',
      'Le volume d\'échanges moyen sur la journée',
    ],
    ans: 1,
  },
  {
    q: 'En quoi consiste le DCA (Dollar Cost Averaging) ?',
    opts: [
      'Acheter massivement lors des plus bas de marché uniquement',
      'Vendre progressivement ses positions pour sécuriser les gains',
      'Investir une somme fixe à intervalles réguliers, quel que soit le cours',
      'Concentrer ses achats sur les actions avec le PER le plus faible',
    ],
    ans: 2,
  },
  {
    q: 'Quelle enveloppe fiscale permet d\'exonérer les plus-values sur actions européennes après 5 ans ?',
    opts: [
      'Le CTO — Compte-Titres Ordinaire',
      'Le PER — Plan d\'Épargne Retraite',
      'L\'assurance-vie en unités de compte',
      'Le PEA — Plan d\'Épargne en Actions',
    ],
    ans: 3,
  },
] as const

export const QUIZ_CRYPTO: ReadonlyArray<QuizQuestion> = [
  {
    q: 'Qu\'est-ce que la blockchain ?',
    opts: [
      'Un registre distribué et immuable qui enregistre des transactions de façon décentralisée',
      'Une cryptomonnaie alternative au Bitcoin, créée en 2015',
      'Une plateforme centralisée permettant d\'acheter et vendre des cryptos',
      'Un portefeuille numérique sécurisé par empreinte digitale',
    ],
    ans: 0,
  },
  {
    q: 'Que signifie « staker » des cryptomonnaies ?',
    opts: [
      'Échanger des cryptos rapidement pour profiter de la volatilité',
      'Bloquer des cryptos pour participer à la validation du réseau et recevoir des récompenses',
      'Convertir ses cryptomonnaies en euros sur une plateforme d\'échange',
      'Miner de nouvelles cryptomonnaies via la puissance de calcul',
    ],
    ans: 1,
  },
  {
    q: 'Qu\'est-ce qu\'un hardware wallet (cold storage) ?',
    opts: [
      'Un compte sur une exchange sécurisé par double authentification',
      'Une cryptomonnaie stable adossée à un actif réel',
      'Un portefeuille physique qui stocke vos clés privées hors ligne',
      'Un service de prêt de cryptomonnaies entre particuliers',
    ],
    ans: 2,
  },
  {
    q: 'La DeFi (Finance Décentralisée) désigne…',
    opts: [
      'Un organisme de régulation internationale des marchés crypto',
      'Des services financiers sans intermédiaire grâce aux smart contracts sur blockchain',
      'Une monnaie numérique de banque centrale (CBDC)',
      'Le déficit énergétique généré par les blockchains',
    ],
    ans: 1,
  },
] as const

export const QUIZ_IMMO: ReadonlyArray<QuizQuestion> = [
  {
    q: 'Comment calcule-t-on le rendement locatif brut d\'un bien ?',
    opts: [
      '(Loyers annuels nets de toutes charges ÷ Prix d\'achat) × 100',
      '(Loyers annuels bruts ÷ Prix d\'achat total frais inclus) × 100',
      '(Prix de revente − Prix d\'achat) ÷ Prix d\'achat × 100',
      'Loyers mensuels perçus × 10',
    ],
    ans: 1,
  },
  {
    q: 'En quoi consiste l\'effet de levier en investissement immobilier ?',
    opts: [
      'Négocier agressivement le prix d\'achat sous le prix marché',
      'Revendre rapidement après achat pour encaisser une plus-value',
      'Utiliser un crédit bancaire pour amplifier le rendement sur son apport personnel',
      'Rembourser le crédit en avance pour réduire le coût des intérêts',
    ],
    ans: 2,
  },
  {
    q: 'Qu\'est-ce qu\'une SCPI ?',
    opts: [
      'Un dispositif fiscal pour déduire des travaux de ses impôts',
      'Un crédit immobilier à taux variable révisé annuellement',
      'Un contrat de location avec option d\'achat pour le locataire',
      'Une société qui collecte l\'épargne pour acheter de l\'immobilier et redistribuer des loyers',
    ],
    ans: 3,
  },
] as const

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
  quiz:    ReadonlyArray<QuizQuestion>,
): number {
  return quiz.reduce((acc, q, i) => acc + (answers[i] === q.ans ? 1 : 0), 0)
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

/**
 * Score d'expérience (0-100) = moyenne pondérée des 3 quiz selon le pct
 * de niveau de chacun. Aligné sur la mécanique d'origine (ProfilePreview).
 */
export function experienceScore(quizzes: {
  bourse: { correct: number; total: number }
  crypto: { correct: number; total: number }
  immo:   { correct: number; total: number }
}): number {
  const lB = quizLevel(quizzes.bourse.correct, quizzes.bourse.total)
  const lC = quizLevel(quizzes.crypto.correct, quizzes.crypto.total)
  const lI = quizLevel(quizzes.immo.correct,   quizzes.immo.total)
  return Math.round((lB.pct + lC.pct + lI.pct) / 3)
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

export type FireTypeId          = 'lean' | 'classic' | 'fat' | 'coast' | 'barista'
export type StabiliteRevenusId  = 'cdi' | 'independant' | 'chomage' | 'retraite'
export type PrioriteId          = 'securite' | 'croissance' | 'immo' | 'equilibre'
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

export function normalizePriorite(v: string | null | undefined): PrioriteId | null {
  if (!v) return null
  const s = v.toLowerCase().trim()
  if (s.includes('sécurité') || s.includes('securite') || s.includes('famille')) return 'securite'
  if (s.includes('immo'))                                                          return 'immo'
  if (s.includes('croissance') || s.includes('transmet') || s.includes('patrimoine')) return 'croissance'
  if (s.includes('équilibre') || s.includes('equilibre'))                          return 'equilibre'
  // Libellés "Liberté de temps" / "Arrêter de travailler" / "Voyager" →
  // équilibré par défaut (FIRE classique sans biais sectoriel).
  if (s.includes('liberté') || s.includes('liberte') || s.includes('arrêter')
   || s.includes('arreter') || s.includes('voyager')) return 'equilibre'
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
 *  ~3 600 €/an pour un enfant scolarisé sans frais exceptionnels). */
const COUT_MENSUEL_PAR_ENFANT_EUR = 300

/** Quotient appliqué au revenu passif cible si l'utilisateur est en couple
 *  marié/pacsé SANS revenu conjoint déclaré : on suppose qu'il devra
 *  financer pour 2 personnes (+50 % de la cible saisie). */
const QUOTIENT_COUPLE_SANS_CONJOINT_REVENU = 0.5

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
  invest_mensuel?:       number | null
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

  fireTargetCapital: number
  fireYearsValue:    number   // peut valoir 99 si inatteignable
  fireAge:           number | null

  axes:            Axe[]
}

// `n` est hoisté en function declaration pour être accessible depuis les
// helpers définis plus tôt dans le fichier (normalizers, adjustCibleFamille…).
 
function n(v: number | null | undefined): number {
  return typeof v === 'number' && isFinite(v) ? v : 0
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
  })
  const risk  = riskScore({ risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4 })
  const total = globalScore({ savingsRatePct: sr, riskPct: risk, experiencePct: exp })

  const cible = fireTarget(n(p.revenu_passif_cible))
  const yrs   = fireYears(epargne, cible)
  const age   = n(p.age) > 0 ? Math.round(n(p.age) + yrs) : null

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

    axes: computeAxes({
      savingsRatePct: sr,
      bourseLevel:    bourse.level,
      cryptoLevel:    crypto.level,
      immoLevel:      immo.level,
      fireYearsValue: yrs,
    }),
  }
}
