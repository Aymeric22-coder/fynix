/**
 * Regles de declenchement des nudges proactifs ARIA.
 *
 * Une regle est evaluee cote client par `evaluateRules` (detector.ts)
 * a partir d'un `ProactiveState` decrit par le hook. Si une regle
 * match, le nudge correspondant est propose a l'utilisateur (Phase 6
 * fournira l'UI).
 *
 * Les triggers sont declaratifs (champs simples) plutot que du code
 * pour rester testable, sans 'eval' ni surface d'attaque XSS.
 */

export type ProactiveEventType =
  | 'csv_import_success'
  | 'position_added'
  | 'bien_added'
  | 'profil_completed'
  | 'simulation_done'

export interface ProactiveState {
  /** Section applicative active (dashboard / portefeuille / fire / immo / cash / analyse / profil). */
  section:           string | null
  /** Secondes passees sur la section sans interaction (move / click / scroll). */
  idleSeconds:       number
  /** Nb d'interactions sur la section depuis l'entree. */
  interactionsCount: number
  /** Dernier evenement applicatif (event-based triggers). */
  lastEvent?:        { type: ProactiveEventType; at: number } | null
  /** ISO timestamp de la derniere fois qu'un nudge a ete dismiss (mute 24h). */
  mutedUntilMs?:     number | null
}

export interface ProactiveRule {
  id:               string
  /** Section applicative ciblee (null = toutes). */
  section?:         string | null
  /** Type de trigger : 'idle' (temps mort) ou 'event' (event-based). */
  trigger:          'idle' | 'event'
  /** Pour trigger='idle' : nb secondes mini avant d'activer le nudge. */
  idleSeconds?:     number
  /** Pour trigger='idle' : nb max d'interactions tolerees (defaut 0). */
  maxInteractions?: number
  /** Pour trigger='event' : type d'event attendu. */
  eventType?:       ProactiveEventType
  /** Texte affiche dans la bulle. */
  message:          string
  /** Prompt pre-rempli quand l'utilisateur clique "Oui, simule". */
  suggested_prompt: string
}

export const ARIA_PROACTIVE_RULES: ReadonlyArray<ProactiveRule> = [
  {
    id:               'fire_long_idle',
    section:          'fire',
    trigger:          'idle',
    idleSeconds:      90,
    maxInteractions:  0,
    message:          'Tu explores ta trajectoire FIRE. Veux-tu que je simule l\'impact d\'augmenter ton DCA de 200 €/mois ?',
    suggested_prompt: 'Simule l\'impact d\'augmenter mon DCA de 200 €/mois sur ma date FIRE.',
  },
  {
    id:               'analyse_long_idle',
    section:          'analyse',
    trigger:          'idle',
    idleSeconds:      120,
    maxInteractions:  1,
    message:          'Beaucoup de chiffres ici ! Je peux te resumer l\'essentiel et te dire ce qui merite ton attention ?',
    suggested_prompt: 'Resume-moi mon analyse patrimoniale et donne-moi les 3 points qui meritent mon attention.',
  },
  {
    id:               'portefeuille_long_idle',
    section:          'portefeuille',
    trigger:          'idle',
    idleSeconds:      90,
    maxInteractions:  0,
    message:          'Ton portefeuille est sous tes yeux. Veux-tu que je verifie la diversification sectorielle ?',
    suggested_prompt: 'Analyse la diversification sectorielle de mon portefeuille et signale les surponderations.',
  },
  {
    id:               'immo_long_idle',
    section:          'immobilier',
    trigger:          'idle',
    idleSeconds:      120,
    maxInteractions:  1,
    message:          'Je peux te chiffrer le rendement net de tes biens et identifier ceux qui sont sous-rentables ?',
    suggested_prompt: 'Donne-moi le rendement net pondere de mon parc immo et liste les biens en dessous de la moyenne.',
  },
  {
    id:               'csv_import_done',
    trigger:          'event',
    eventType:        'csv_import_success',
    message:          'Import termine ! Veux-tu que j\'analyse l\'impact de tes nouvelles positions sur ton allocation ?',
    suggested_prompt: 'Analyse l\'impact de mes nouvelles positions sur mon allocation par classe et par secteur.',
  },
  {
    id:               'bien_added',
    trigger:          'event',
    eventType:        'bien_added',
    message:          'Nouveau bien ajoute. Je peux simuler son impact sur ta date FIRE ?',
    suggested_prompt: 'Simule l\'impact de mon dernier bien immobilier ajoute sur ma date FIRE.',
  },
]
