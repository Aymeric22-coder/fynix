/**
 * CS6 — Source de vérité UNIQUE des quiz Bourse / Crypto / Immo.
 *
 * Chaque question porte :
 *   - `id`           identifiant stable (utilisé par tests + analytics — NE
 *                    change PAS même si l'ordre de l'array change)
 *   - `text`         libellé affiché à l'utilisateur (Step5/6/7 via QuizStep)
 *   - `options`      4 propositions cliquables
 *   - `correctIndex` index de la bonne réponse dans `options`
 *   - `tag`          clé concept utilisée par `deriveMissedConcepts` et les
 *                    micro-leçons QW10 (1 tag = 1 concept = 1 lesson)
 *   - `lesson`       paragraphe court (40-60 mots, tutoiement, pédagogie
 *                    neutre — pas de promesse produit) affiché par QW10
 *                    quand l'utilisateur rate la question
 *
 * Pattern miroir de `lifeEventsConstants.ts` (CS5) et `enveloppesConstants.ts`
 * (dette CS5). Aucun consommateur ne doit redéclarer un texte de question
 * en dur — un test garde-fou vérifie ça (cf. quizCatalog.test.ts).
 *
 * ⚠️ AVERTISSEMENT — ordre/quantité figés en prod
 *
 * Les réponses utilisateur sont persistées en colonne `quiz_X INTEGER[]`
 * (migration 015). Si on ajoute/retire/réordonne une question :
 *   - les `quiz_X` existants pointent vers les MAUVAISES questions ;
 *   - le scoring devient faux silencieusement pour tous les profils.
 *
 * Toute évolution = soit (a) migration de re-mapping (mapper l'ancien
 * INTEGER[] vers le nouveau via `id` historique), soit (b) système de
 * versioning du catalogue (`quiz_bourse_version INTEGER`, lecture selon
 * la version stockée). À traiter au cas par cas. Pour l'instant : **figé**.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export type QuizDomain = 'bourse' | 'crypto' | 'immo'

export interface QuizQuestion {
  readonly id:           string
  readonly text:         string
  readonly options:      ReadonlyArray<string>
  readonly correctIndex: number
  readonly tag:          string
  /** QW10 — titre court de la micro-leçon (« Les ETF », « Le PEA
   *  fiscalement »…) affiché en header de la carte leçon. */
  readonly lessonTitle:  string
  /** QW10 — pictogramme léger (1 emoji) qui décore la carte leçon. */
  readonly lessonEmoji:  string
  readonly lesson:       string
}

// ────────────────────────────────────────────────────────────────────
// Catalogue
// ────────────────────────────────────────────────────────────────────

const QUIZ_BOURSE: ReadonlyArray<QuizQuestion> = [
  {
    id: 'bourse-etf-definition',
    tag: 'etf',
    text: 'Qu\'est-ce qu\'un ETF ?',
    options: [
      'Un fonds indiciel coté en bourse qui réplique la performance d\'un indice',
      'Une action d\'une seule entreprise cotée en bourse',
      'Un produit d\'épargne garanti et réglementé par l\'État',
      'Une obligation émise par une entreprise pour se financer',
    ],
    correctIndex: 0,
    lessonTitle: 'Les ETF',
    lessonEmoji: '📊',
    lesson:
      'Un ETF est un fonds coté en bourse qui réplique mécaniquement un indice ' +
      '(CAC 40, MSCI World…). En achetant une part, tu détiens en miniature toutes ' +
      'les valeurs de l\'indice. Frais réduits (~0,2 %/an) et diversification immédiate — ' +
      'c\'est l\'outil de base de l\'investissement passif.',
  },
  {
    // Content polish — remplace bourse-per-ratio (off-target stock-picking
    // actif) par une notion centrale de l'investissement passif FIRE :
    // rebalancing périodique. Cohérent avec le profil cible Fynix (DCA +
    // allocation passive long terme). Même index (Bourse[1]) → safe pour
    // les colonnes quiz_bourse INTEGER[] existantes en DB.
    id: 'bourse-rebalancing',
    tag: 'rebalancing',
    text: 'Pourquoi rebalancer périodiquement son portefeuille passif ?',
    options: [
      'Pour générer plus de frais de transaction chez son courtier',
      'Pour ramener l\'allocation à sa cible : vendre ce qui a monté, racheter ce qui a baissé',
      'Pour suivre exclusivement les actifs en momentum récent',
      'Pour répliquer un indice à la lettre, sans aucune marge de manœuvre',
    ],
    correctIndex: 1,
    lessonTitle: 'Le rebalancing',
    lessonEmoji: '⚖️',
    lesson:
      'Rebalancer, c\'est ramener périodiquement (en général 1 fois/an) ton portefeuille à son ' +
      'allocation cible — par exemple 70 % actions / 30 % obligations. Quand un actif a ' +
      'surperformé, tu en vends une partie pour racheter ce qui a baissé. Ça discipline les ' +
      'ventes en haut de cycle et les achats en creux, sans avoir à prédire le marché. Couplé ' +
      'au DCA, c\'est le geste qui fait le rendement passif sur 20 ans.',
  },
  {
    id: 'bourse-dca-definition',
    tag: 'dca',
    text: 'En quoi consiste le DCA (Dollar Cost Averaging) ?',
    options: [
      'Acheter massivement lors des plus bas de marché uniquement',
      'Vendre progressivement ses positions pour sécuriser les gains',
      'Investir une somme fixe à intervalles réguliers, quel que soit le cours',
      'Concentrer ses achats sur les actions avec le PER le plus faible',
    ],
    correctIndex: 2,
    lessonTitle: 'Le DCA',
    lessonEmoji: '⏱️',
    lesson:
      'Le DCA (Dollar Cost Averaging) consiste à investir un montant fixe à intervalles ' +
      'réguliers, peu importe le cours. Tu achètes plus d\'unités quand le marché baisse, ' +
      'moins quand il monte — ton prix moyen se lisse mécaniquement. C\'est la parade ' +
      'efficace au stress du market timing.',
  },
  {
    id: 'bourse-pea-fiscalite',
    tag: 'pea-fiscalite',
    text: 'Quelle enveloppe fiscale permet d\'exonérer les plus-values sur actions européennes après 5 ans ?',
    options: [
      'Le CTO — Compte-Titres Ordinaire',
      'Le PER — Plan d\'Épargne Retraite',
      'L\'assurance-vie en unités de compte',
      'Le PEA — Plan d\'Épargne en Actions',
    ],
    correctIndex: 3,
    lessonTitle: 'La fiscalité du PEA',
    lessonEmoji: '🏦',
    lesson:
      'Le PEA (Plan d\'Épargne en Actions) exonère d\'impôt sur le revenu les plus-values ' +
      'après 5 ans de détention. Seuls les prélèvements sociaux (17,2 %) restent dus. ' +
      'Plafond de versements : 150 000 €. Limité aux actions et fonds européens éligibles. ' +
      'C\'est l\'enveloppe la plus efficace pour la bourse européenne long terme.',
  },
]

const QUIZ_CRYPTO: ReadonlyArray<QuizQuestion> = [
  {
    id: 'crypto-blockchain-definition',
    tag: 'blockchain',
    text: 'Qu\'est-ce que la blockchain ?',
    options: [
      'Un registre distribué et immuable qui enregistre des transactions de façon décentralisée',
      'Une cryptomonnaie alternative au Bitcoin, créée en 2015',
      'Une plateforme centralisée permettant d\'acheter et vendre des cryptos',
      'Un portefeuille numérique sécurisé par empreinte digitale',
    ],
    correctIndex: 0,
    lessonTitle: 'La blockchain',
    lessonEmoji: '🔗',
    lesson:
      'Une blockchain est un registre numérique partagé entre des milliers d\'ordinateurs, ' +
      'sans autorité centrale. Chaque transaction est validée par consensus et inscrite de ' +
      'façon immuable. C\'est l\'infrastructure technique de Bitcoin, Ethereum et de tous ' +
      'les actifs crypto.',
  },
  {
    id: 'crypto-staking-definition',
    tag: 'staking',
    text: 'Que signifie « staker » des cryptomonnaies ?',
    options: [
      'Échanger des cryptos rapidement pour profiter de la volatilité',
      'Bloquer des cryptos pour participer à la validation du réseau et recevoir des récompenses',
      'Convertir ses cryptomonnaies en euros sur une plateforme d\'échange',
      'Miner de nouvelles cryptomonnaies via la puissance de calcul',
    ],
    correctIndex: 1,
    lessonTitle: 'Le staking',
    lessonEmoji: '🪙',
    lesson:
      'Staker, c\'est immobiliser ses cryptos sur le réseau pour participer à la validation ' +
      'des blocs (mécanisme Proof-of-Stake). En échange, tu reçois des récompenses (souvent ' +
      '3 à 7 %/an selon la crypto). Tes fonds sont bloqués pendant une période variable et ' +
      'un comportement frauduleux peut entraîner une perte partielle (slashing).',
  },
  {
    id: 'crypto-cold-storage',
    tag: 'cold-storage',
    text: 'Qu\'est-ce qu\'un hardware wallet (cold storage) ?',
    options: [
      'Un compte sur une exchange sécurisé par double authentification',
      'Une cryptomonnaie stable adossée à un actif réel',
      'Un portefeuille physique qui stocke vos clés privées hors ligne',
      'Un service de prêt de cryptomonnaies entre particuliers',
    ],
    correctIndex: 2,
    lessonTitle: 'Le cold storage',
    lessonEmoji: '🔐',
    lesson:
      'Un hardware wallet (Ledger, Trezor…) stocke tes clés privées dans un dispositif hors ' +
      'ligne. Sans ces clés, personne ne peut bouger tes cryptos — pas même un site piraté. ' +
      'C\'est la méthode recommandée dès que tu dépasses quelques milliers d\'euros : tu ' +
      'reprends le contrôle réel de tes actifs.',
  },
  {
    // Content polish — remplace crypto-defi-definition (off-target speculatif)
    // par la discipline de prise de gains, plus alignée FIRE/sécurisation
    // patrimoine. Même index (Crypto[3]) → safe pour les colonnes
    // quiz_crypto INTEGER[] existantes en DB.
    id: 'crypto-prise-de-gains',
    tag: 'prise-de-gains',
    text: 'Pourquoi prendre régulièrement ses gains crypto plutôt que tout garder en allocation ?',
    options: [
      'C\'est inutile : la crypto se conserve uniquement long terme, jamais en sécurisation',
      'Pour limiter l\'exposition à la volatilité et faire entrer un patrimoine effectif sur des supports plus stables',
      'Pour bénéficier de frais réduits sur les retraits massifs',
      'Parce que les exchanges l\'imposent au-delà d\'un certain seuil',
    ],
    correctIndex: 1,
    lessonTitle: 'La prise de gains crypto',
    lessonEmoji: '🪙',
    lesson:
      'La crypto fait facilement +200 % en 6 mois… puis -70 % les 6 suivants. Garder 100 % ' +
      'd\'un patrimoine grandi en crypto, c\'est laisser le marché décider du capital effectif ' +
      'que tu détiens vraiment. La discipline FIRE-compatible : à chaque palier (par exemple ' +
      'quand la crypto dépasse 10 % du patrimoine total), arbitre une partie vers PEA, AV ou ' +
      'livret. Tu sécurises un capital réel sans renier la conviction long terme.',
  },
]

const QUIZ_IMMO: ReadonlyArray<QuizQuestion> = [
  {
    id: 'immo-rendement-brut',
    tag: 'rendement-brut',
    text: 'Comment calcule-t-on le rendement locatif brut d\'un bien ?',
    options: [
      '(Loyers annuels nets de toutes charges ÷ Prix d\'achat) × 100',
      '(Loyers annuels bruts ÷ Prix d\'achat total frais inclus) × 100',
      '(Prix de revente − Prix d\'achat) ÷ Prix d\'achat × 100',
      'Loyers mensuels perçus × 10',
    ],
    correctIndex: 1,
    lessonTitle: 'Le rendement locatif brut',
    lessonEmoji: '💹',
    lesson:
      'Le rendement locatif brut = (loyer annuel ÷ prix d\'achat frais inclus) × 100. Pour ' +
      '800 €/mois de loyer sur un bien à 150 000 € frais inclus : (9 600 ÷ 150 000) × 100 = ' +
      '6,4 %. C\'est un repère rapide pour comparer des biens — mais le rendement NET (après ' +
      'charges, impôts, vacance) est ce qui tombe réellement dans ta poche.',
  },
  {
    id: 'immo-effet-levier',
    tag: 'effet-levier',
    text: 'En quoi consiste l\'effet de levier en investissement immobilier ?',
    options: [
      'Négocier agressivement le prix d\'achat sous le prix marché',
      'Revendre rapidement après achat pour encaisser une plus-value',
      'Utiliser un crédit bancaire pour amplifier le rendement sur son apport personnel',
      'Rembourser le crédit en avance pour réduire le coût des intérêts',
    ],
    correctIndex: 2,
    lessonTitle: 'L\'effet de levier',
    lessonEmoji: '⚖️',
    lesson:
      'L\'effet de levier, c\'est utiliser un crédit pour acheter un bien plus cher que ton ' +
      'apport. Si tu mets 30 k€ d\'apport pour un bien à 200 k€ qui prend 5 % de valeur, ' +
      'tu gagnes 10 k€ sur un investissement initial de 30 k€ — soit ~33 % de rendement ' +
      'sur ton apport (avant intérêts du crédit). Attention : le levier amplifie aussi les ' +
      'pertes en cas de baisse.',
  },
  {
    id: 'immo-scpi-definition',
    tag: 'scpi',
    text: 'Qu\'est-ce qu\'une SCPI ?',
    options: [
      'Un dispositif fiscal pour déduire des travaux de ses impôts',
      'Un crédit immobilier à taux variable révisé annuellement',
      'Un contrat de location avec option d\'achat pour le locataire',
      'Une société qui collecte l\'épargne pour acheter de l\'immobilier et redistribuer des loyers',
    ],
    correctIndex: 3,
    lessonTitle: 'Les SCPI',
    lessonEmoji: '🏢',
    // TODO: vérifier exactitude légale — fiscalité SCPI = revenus fonciers (IR au barème
    // + 17,2 % PS), abattement micro-foncier 30 % si total fonciers < 15 000 €/an,
    // régime réel sinon. La formulation "fiscalité comme un loyer classique" est juste
    // mais simplifiée. À valider avec un fiscaliste si on veut être précis au mot près.
    lesson:
      'Une SCPI (Société Civile de Placement Immobilier) achète et gère un parc immobilier ' +
      'locatif (bureaux, commerces, santé…) avec l\'argent collecté auprès d\'épargnants. ' +
      'Tu touches des loyers proportionnels à tes parts, sans gérer toi-même les locataires. ' +
      'Rendements moyens 4 à 6 %/an, fiscalité des revenus fonciers (IR au barème + 17,2 % PS).',
  },
]

/**
 * Catalogue exposé. Clé = `QuizDomain`. Lecture seule, gelé en runtime
 * (les consommateurs reçoivent un ReadonlyArray dont les éléments sont
 * `readonly`).
 */
export const QUIZ_CATALOG: Readonly<Record<QuizDomain, ReadonlyArray<QuizQuestion>>> = {
  bourse: QUIZ_BOURSE,
  crypto: QUIZ_CRYPTO,
  immo:   QUIZ_IMMO,
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/** Accès direct au tableau de questions d'un domaine. */
export function getQuizQuestions(domain: QuizDomain): ReadonlyArray<QuizQuestion> {
  return QUIZ_CATALOG[domain]
}

/** Sentinel "non répondu" utilisé dans `quiz_X INTEGER[]` (Step QuizStep.tsx). */
export const QUIZ_ANSWER_SENTINEL_UNANSWERED = -1

/**
 * Renvoie les questions où l'utilisateur s'est trompé.
 *
 * Règles :
 *   - `answers[i] === correctIndex`                       → réussie (ignorée)
 *   - `answers[i] === QUIZ_ANSWER_SENTINEL_UNANSWERED`    → non répondue
 *                                                          (ignorée — pas
 *                                                          un raté actif)
 *   - `answers[i] === null | undefined`                   → idem, non répondue
 *   - sinon                                               → ratée → retournée
 *
 * Si l'utilisateur s'est auto-déclaré Expert (CS3 R5), `quiz_X` reste à
 * `[-1, -1, -1, -1]` côté DB → cette fonction retourne `[]`. Le caller
 * (QW10 micro-leçons) skip donc l'affichage pour ce domaine. Comportement
 * cohérent avec QuizStep qui masque les questions dans ce cas.
 *
 * Pur, testable sans I/O.
 */
export function deriveMissedConcepts(
  domain:  QuizDomain,
  answers: ReadonlyArray<number | null | undefined>,
): ReadonlyArray<QuizQuestion> {
  const quiz = QUIZ_CATALOG[domain]
  const missed: QuizQuestion[] = []
  for (let i = 0; i < quiz.length; i++) {
    const a = answers[i]
    if (a === null || a === undefined)                  continue
    if (a === QUIZ_ANSWER_SENTINEL_UNANSWERED)          continue
    const q = quiz[i]!
    if (a !== q.correctIndex) missed.push(q)
  }
  return missed
}

/**
 * Variante typée qui renvoie juste les tags concepts ratés — utile pour
 * de l'analyse aval (groupement, exports, etc.).
 */
export function deriveMissedConceptTags(
  domain:  QuizDomain,
  answers: ReadonlyArray<number | null | undefined>,
): ReadonlyArray<string> {
  return deriveMissedConcepts(domain, answers).map((q) => q.tag)
}
