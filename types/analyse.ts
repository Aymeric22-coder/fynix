/**
 * Types du module Analyse — enrichissement ISIN et exposition portefeuille.
 *
 * Volontairement séparé de `types/database.types.ts` : ce sont des types
 * d'application, calculés / dérivés, pas un mapping direct des tables.
 */

export type AnalyseAssetType =
  | 'stock'
  | 'etf'
  | 'crypto'
  | 'bond'
  | 'scpi'
  | 'unknown'

/**
 * Snapshot d'enrichissement pour un ISIN — ce que la couche Analyse
 * sert au reste de l'app (vues sectorielles, géographiques, etc.).
 */
export interface ISINData {
  isin:          string
  symbol:        string | null     // ticker Yahoo Finance (ex: "AAPL", "BNP.PA")
  name:          string
  asset_type:    AnalyseAssetType
  sector:        string | null     // libellé Yahoo brut (ex: "Technology")
  industry:      string | null
  country:       string | null     // libellé Yahoo brut ou code ISO
  currency:      string            // ex: "EUR", "USD"
  exchange:      string | null     // ex: "PAR", "NMS"
  current_price: number | null
  cached_at:     string            // ISO timestamp
}

/**
 * Position enrichie : ce qu'on calcule à la volée pour chaque ligne du
 * portefeuille en croisant la position DB et l'ISINData.
 */
export interface EnrichedPosition {
  isin:                string
  name:                string
  quantity:            number
  pru:                 number
  current_price:       number
  current_value:       number       // valeur en EUR (post-conversion FX)
  current_value_local: number       // valeur dans la devise de cotation (avant FX)
  gain_loss:           number       // EUR
  gain_loss_pct:       number
  asset_type:          AnalyseAssetType
  sector:              string | null
  country:             string | null
  currency:            string       // devise de cotation (USD, EUR, …)
  /** True si current_price provient du PRU (Yahoo + DB sans donnée). */
  price_estimated:     boolean
  /** % de cette position dans la valeur totale du portefeuille (0-100). */
  weight_in_portfolio: number
}

// ─────────────────────────────────────────────────────────────────
// Phase 2 — Agrégat patrimonial complet
// ─────────────────────────────────────────────────────────────────

/** Bien immobilier consolidé, prêt pour la vue d'analyse. */
export interface BienImmo {
  id:               string
  nom:              string
  ville:            string | null
  pays:             string | null
  type:             string                  // 'Résidence principale' | 'Locatif' | 'SCPI' | …
  valeur:           number                  // valeur de marché EUR
  loyer_mensuel:    number                  // loyer brut EUR/mois
  credit_restant:   number                  // capital restant dû (EUR)
  equity:           number                  // valeur - credit_restant
  rendement_brut:   number                  // % annuel brut (loyers × 12 / valeur × 100)
}

/** Compte cash / livret consolidé. */
export interface CompteCash {
  id:        string
  nom:       string
  type:      string             // 'livret_a' | 'ldds' | 'compte_courant' | …
  banque:    string | null
  solde:     number             // EUR (post-FX si devise étrangère)
  devise:    string             // devise d'origine
}

/** Classe d'actif agrégée pour la vue d'allocation patrimoniale. */
export interface ClasseAlloc {
  label:       string         // 'Actions' | 'ETF / Fonds' | 'Crypto' | 'Immobilier' | 'Cash' | 'Obligataire'
  valeur:      number          // EUR
  pourcentage: number          // 0..100
  color:       string          // hex stable par classe
}

/** Allocation sectorielle (avec alerte de surexposition). */
export interface SecteurAlloc {
  secteur:     string          // libellé FR (ex: 'Technologie')
  valeur:      number
  pourcentage: number
  positions:   string[]        // noms des actifs sources (max 10 affichés)
  alerte:      boolean         // true si > 30 %
}

/** Indicateur de fiabilité de l'analyse sectorielle / géographique. */
export interface AnalyseFiabilite {
  /** % du patrimoine analysable (positions+immo, hors cash) qui est identifié. */
  pct:        number          // 0..100
  /** Statut visuel (vert/orange/rouge). */
  niveau:     'vert' | 'orange' | 'rouge'
  /** Texte humain prêt pour l'UI. */
  label:      string          // ex: "Analyse fiable" / "Données insuffisantes"
}

/** Allocation géographique (avec alerte de surexposition zone). */
export interface GeoAlloc {
  zone:        string
  valeur:      number
  pourcentage: number
  pays:        string[]        // libellés bruts ou codes ISO
  alerte:      boolean         // true si > 50 %
}

/** Snapshot complet du patrimoine d'un utilisateur, prêt à être affiché. */
export interface PatrimoineComplet {
  totalBrut:        number     // somme de tout (financier + immo + cash, hors dettes)
  totalNet:         number     // totalBrut - totalDettes
  totalPortefeuille: number    // actions + ETF + crypto + obligs (positions)
  totalImmo:        number     // valeur brute immobilier
  totalCash:        number     // tous les comptes / livrets
  totalDettes:      number     // capital restant dû tous crédits

  positions:        EnrichedPosition[]
  biens:            BienImmo[]
  comptes:          CompteCash[]

  repartitionClasses:     ClasseAlloc[]
  repartitionSectorielle: SecteurAlloc[]
  repartitionGeo:         GeoAlloc[]

  /** Score de diversification 0..100 : 100 = parfaitement réparti. */
  scoreDiversificationSectorielle: number
  scoreDiversificationGeo:         number

  /** Rendement estimé annuel (% pondéré : rendement immo + dividendes). */
  rendementEstime:    number
  /** Loyers + dividendes mensuels estimés. */
  revenuPassifActuel: number

  /** Sentinel : 'Conservateur' | 'Équilibré' | 'Dynamique' | 'Offensif' | 'Stratège' | null */
  profilType:    string | null
  /** Prénom utilisateur depuis profile (ou null). */
  prenom:        string | null

  // ── Phase 3 — Intelligence ──────────────────────────────────────
  /** Inputs nécessaires aux composants client (sliders projection FIRE). */
  fireInputs:    {
    age:                 number | null
    age_cible:           number | null
    epargne_mensuelle:   number   // €/mois
    revenu_passif_cible: number   // €/mois
    charges_mensuelles:  number   // pour le scoring solidité (loyer + crédits + fixes + courantes)
    risk_score:          number   // recalculé depuis profile.risk_1..4 (0-100)
    enveloppes:          string[]
    tmi_rate:            number | null
    actions_eu_value:    number   // valeur des positions stock+etf zone Europe (PEA-éligible)
  }

  /** Cinq scores d'intelligence (voir lib/analyse/scores.ts). */
  scores:        ScoresComplets

  /** Recommandations priorisées (voir lib/analyse/recommandations.ts). */
  recommandations: Recommandation[]

  // ── Phase 4 — Expansion ETF + fiabilité ──────────────────────────
  /** Indicateur de fiabilité de l'analyse sectorielle/géo. */
  analyseFiabilite: AnalyseFiabilite
  /** ISIN d'ETF non référencés dans la table de compositions. */
  unmappedEtfs:     Array<{ isin: string; name: string; value: number }>

  lastUpdated:   string         // ISO timestamp
}

// ─────────────────────────────────────────────────────────────────
// Phase 3 — Scores, projection FIRE, recommandations
// ─────────────────────────────────────────────────────────────────

/** Niveau visuel d'un score (couleur + libellé associé). */
export type ScoreNiveau = 'rouge' | 'orange' | 'jaune' | 'vert' | 'gris'

/** Un score 0-100 + son niveau + label humain + détails optionnels. */
export interface Score {
  /** Valeur 0..100, ou null si données insuffisantes. */
  value:   number | null
  niveau:  ScoreNiveau
  label:   string                     // ex: "Bien diversifié"
  /** Texte court qui explique pourquoi ce score (affiché en sous-titre). */
  details?: string
}

/** Snapshot des 5 scores d'intelligence. */
export interface ScoresComplets {
  diversification:    Score
  coherence_profil:   Score
  progression_fire:   Score
  solidite:           Score
  efficience_fiscale: Score
}

/** Une recommandation personnalisée. */
export interface Recommandation {
  id:             string
  priorite:       'haute' | 'moyenne' | 'info'
  categorie:      'diversification' | 'fiscalite' | 'fire' | 'risque' | 'liquidite'
  titre:          string
  description:    string
  /** Ex : "Gain de 3 ans sur votre FIRE". Null si non quantifiable. */
  impact_estime:  string | null
  /** Action concrète à mener. */
  action:         string
}

/** Un point de la courbe de projection FIRE (1 par année). */
export interface ProjectionPoint {
  age:               number
  pessimiste:        number
  central:           number
  optimiste:         number
}

/** Résultat global d'une simulation. */
export interface ProjectionResult {
  points:                  ProjectionPoint[]
  /** Âge auquel la courbe centrale atteint la cible (null si jamais en 35 ans). */
  ageIndependanceCentral:  number | null
  /** Différence en années vs âge cible déclaré (positif = retard). */
  ecartObjectif:           number | null
  /** Patrimoine projeté à l'âge cible (scénario central). */
  patrimoineAgeCible:      number
  /** Hypothèse de rendement central appliquée (%). */
  rendementUtilise:        number
}

/** Couleurs stables par classe d'actif (alignées avec la spec Phase 2). */
export const CLASSE_COLOR: Record<string, string> = {
  Actions:      '#38BDF8',     // bleu ciel
  'ETF / Fonds':'#10B981',     // emerald (cohérent avec accent app)
  Crypto:       '#A78BFA',     // violet
  Immobilier:   '#E8B84B',     // or (seul écart visuel — utile pour distinguer immo)
  Cash:         '#71717a',     // muted
  Obligataire:  '#F97316',     // orange
}
