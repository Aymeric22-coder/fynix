/**
 * Types ARIA — assistant patrimonial IA (Phase 1).
 *
 * `AriaLiveContext` est l'objet injecte dans le system prompt de Claude
 * a chaque message : il contient une photo INSTANTANEE et formatable
 * de toutes les donnees patrimoniales de l'utilisateur, au format
 * compact (cle / valeur) plutot que les types riches de `types/analyse`.
 *
 * Les valeurs financieres sont toutes en EUR (deja converties en amont
 * par `lib/analyse/aggregateur.ts > getPatrimoineComplet`).
 */

// ─────────────────────────────────────────────────────────────────
// Sous-blocs
// ─────────────────────────────────────────────────────────────────

export interface AriaUserProfile {
  prenom:                  string | null
  age:                     number | null
  age_fire_cible:          number | null
  type_investisseur:       string | null     // 'Conservateur' | 'Equilibre' | ... | null
  /** Score de risque 0-100 (calcule depuis risk_1..4). */
  tolerance_risque:        number | null
  /** Revenu passif mensuel cible declare par l'utilisateur (EUR/mois). */
  revenu_passif_objectif:  number | null
  /** TMI declaree (ex: 0.30 pour TMI 30 %). null si non renseignee. */
  tmi_rate:                number | null
}

export interface AriaPatrimoine {
  brut:               number
  net:                number
  dettes:             number
  /** Variation du patrimoine net sur 30 jours (%). null si pas assez de snapshots. */
  evolution_30j_pct:  number | null
  evolution_90j_pct:  number | null
}

export interface AriaPosition {
  /** Ticker court (symbol Yahoo) ou ISIN si pas de symbol. */
  ticker:           string
  nom:              string
  /** 'stock' | 'etf' | 'crypto' | 'bond' | 'scpi' | 'metal' | 'unknown'. */
  classe:           string
  quantite:         number
  pru:              number
  valeur_actuelle:  number          // EUR
  pv_latente:       number          // EUR
  pv_latente_pct:   number
  devise:           string
}

export interface AriaRepartitionLine {
  label:       string
  pourcentage: number
}

export interface AriaPortfolio {
  valeur_totale:        number
  pv_latente_totale:    number
  nb_positions:         number
  top_3_par_valeur:     AriaPosition[]
  repartition_classes:  AriaRepartitionLine[]
  repartition_secteurs: AriaRepartitionLine[]
  repartition_geo:      AriaRepartitionLine[]
}

export interface AriaBien {
  id:                   string
  nom:                  string
  ville:                string | null
  type:                 string                                       // 'Locatif', 'Residence principale'...
  valeur:               number
  equity:               number
  loyer_mensuel:        number
  cashflow_mensuel:     number
  rendement_brut_pct:   number
  rendement_net_pct:    number
  ltv_pct:              number
  niveau_levier:        'Sans credit' | 'Faible' | 'Modere' | 'Fort'
}

export interface AriaImmo {
  nb_biens:                  number
  valeur_brute_totale:       number
  credit_total_restant:      number
  equity_totale:             number
  loyers_annuels_totaux:     number
  rendement_net_moyen_pct:   number
  revenu_passif_mensuel:     number
  biens:                     AriaBien[]
}

export interface AriaCompteCash {
  id:      string
  nom:     string
  type:    string
  solde:   number
  devise:  string
}

export interface AriaCash {
  total:               number
  /** Nombre de mois de charges courantes couverts par le cash dispo. */
  mois_precaution:     number | null
  /** True si le cash > 12 mois de charges (placement sub-optimal). */
  cash_excessif:       boolean
  comptes:             AriaCompteCash[]
}

export interface AriaFire {
  cible_patrimoine:        number | null
  /** Progression actuelle vs cible (%). */
  progression_pct:         number | null
  age_fire_estime:         number | null
  age_fire_optimiste:      number | null
  age_fire_pessimiste:     number | null
  annees_restantes:        number | null
  revenu_passif_actuel:    number
  /** SWR effectivement utilise (%, ex: 4). */
  taux_retrait_pct:        number | null
  /** Ecart en EUR entre cible et patrimoine actuel (positif = retard). */
  ecart_objectif_eur:      number | null
}

export interface AriaScore {
  value:  number | null
  niveau: string                                  // 'rouge' | 'orange' | 'jaune' | 'vert' | 'gris'
  label:  string
}

export interface AriaScores {
  diversification:    AriaScore
  coherence_profil:   AriaScore
  progression_fire:   AriaScore
  solidite:           AriaScore
  efficience_fiscale: AriaScore
}

export type AriaAlerteType = 'warning' | 'info' | 'success' | 'critical'

export interface AriaAlerte {
  type:             AriaAlerteType
  categorie:        string                        // 'diversification' | 'fiscalite' | 'fire' | 'risque' | 'liquidite'
  message:          string
  action_suggeree:  string | null
}

export interface AriaActionRecente {
  /** ISO 8601 date string. */
  date:        string
  type:        string                             // 'ajout_position' | 'modif_credit' | 'import_csv'...
  description: string
}

export interface AriaUIContext {
  /** Section applicative active ('dashboard' | 'portefeuille' | 'analyse' | 'fire' | 'immo' | 'cash' | 'profil'...). */
  section:                 string | null
  page_url:                string | null
  /** Description courte de la derniere action visible dans l'UI (ex: 'simulation FIRE en cours'). */
  derniere_action_chrono?: string | null
}

// ─────────────────────────────────────────────────────────────────
// Assemblage final
// ─────────────────────────────────────────────────────────────────

export interface AriaLiveContext {
  profil:          AriaUserProfile
  patrimoine:      AriaPatrimoine
  portefeuille:    AriaPortfolio
  immo:            AriaImmo
  cash:            AriaCash
  fire:            AriaFire
  scores:          AriaScores
  alertes:         AriaAlerte[]
  actions_recentes: AriaActionRecente[]
  ui:              AriaUIContext
  /** ISO timestamp du moment ou le contexte a ete construit. */
  generated_at:    string
}

// ─────────────────────────────────────────────────────────────────
// Donnees brutes (sortie de fetchUserData)
// ─────────────────────────────────────────────────────────────────

export interface AriaActivityRow {
  id:          string
  type:        string
  description: string
  metadata:    Record<string, unknown>
  created_at:  string
}

export interface AriaWealthSnapshotRow {
  snapshot_date:        string
  patrimoine_net:       number
  patrimoine_brut:      number
  total_dettes:         number
}

/**
 * Snapshot brut renvoye par `fetchUserData` — sert d'input a
 * `buildContextFromRaw` qui le mappe vers `AriaLiveContext`.
 *
 * On reutilise volontairement `PatrimoineComplet` comme container
 * principal pour eviter toute duplication de calcul (regle #1).
 */
export interface AriaRawData {
  /** PatrimoineComplet importe via `lib/analyse/aggregateur.ts`. */
  patrimoine:  import('@/types/analyse').PatrimoineComplet
  /** Snapshots wealth (table `wealth_snapshots`, migration 020) — tries du plus recent au plus ancien. */
  snapshots:   AriaWealthSnapshotRow[]
  /** 10 dernieres lignes de `user_activity_log`. */
  activites:   AriaActivityRow[]
}

// ─────────────────────────────────────────────────────────────────
// API publique (sortie de buildLiveContext)
// ─────────────────────────────────────────────────────────────────

export interface AriaBuiltContext {
  context:      AriaLiveContext
  systemPrompt: string
}
