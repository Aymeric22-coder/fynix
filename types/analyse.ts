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
  | 'metal'      // or, argent, platine, palladium et trackers de matières premières
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
  id:                  string
  nom:                 string
  ville:               string | null
  pays:                string | null
  type:                string                  // 'Résidence principale' | 'Locatif' | 'SCPI' | …
  valeur:              number                  // valeur de marché EUR
  loyer_mensuel:       number                  // loyer brut EUR/mois
  credit_restant:      number                  // capital restant dû (EUR)
  mensualite_credit:   number                  // mensualité (capital+intérêts+assurance) EUR/mois
  charges_annuelles:   number                  // somme charges réelles (taxe + copro + PNO + gestion)
  equity:              number                  // valeur - credit_restant
  rendement_brut:      number                  // % annuel brut (loyers × 12 / valeur × 100)
  rendement_net:       number                  // % annuel net (après charges)
  cashflow_mensuel:    number                  // loyer - mensualité - charges/12 (peut être négatif)
  ltv:                 number                  // 0-100, leverage ratio
  niveau_levier:       'Sans crédit' | 'Faible' | 'Modéré' | 'Fort'
  risque_immo:         number                  // 30-75
  donnees_completes:   boolean
  /** Taux d'intérêt annuel estimé du crédit (utilisé pour amortir année par
   *  année dans la projection FIRE). Defaut 3 % si inconnu. */
  taux_interet_estime: number
  /** Durée restante du crédit en mois (utilisée pour la projection).
   *  Calculée depuis capital + mensualité + taux ; 0 si pas de crédit. */
  duree_restante_mois: number
}

// ─────────────────────────────────────────────────────────────────
// Phase 9 — Projection FIRE multi-composantes
// ─────────────────────────────────────────────────────────────────

/** Acquisition immobilière future (simulateur, pas stockée en DB). */
export interface AcquisitionFuture {
  id:                       string
  nom:                      string
  dans_combien_annees:      number      // 1..20
  prix_achat:               number      // FAI (frais agence inclus)
  frais_notaire_pct:        number      // % (défaut 8)
  apport:                   number      // capital sorti à l'achat
  taux_interet:             number      // % annuel
  duree_credit_ans:         number      // 15 / 20 / 25
  type:                     'locatif' | 'RP'
  loyer_brut_mensuel:       number      // 0 si RP
  taux_vacance_pct:         number      // % (défaut 5)
  charges_mensuelles:       number      // taxe/12, copro, PNO…
  appreciation_annuelle_pct: number     // % (défaut 2)
}

/** Snapshot d'une année dans la projection patrimoniale combinée. */
export interface AnneeProjection {
  age:                  number
  patrimoineFinancier:  number
  equityImmoExistant:   number      // somme des equities des biens DB
  equityImmoFuture:     number      // somme des equities des acquisitions futures
  cash:                 number
  total:                number      // somme des 4
  /** Loyers nets annuels (cashflow positif) — sert pour le revenu passif. */
  loyersNetsAnnuels:    number
  /** Mensualités totales sorties (DCA + mensualités crédits immo). */
  effortMensuel:        number
}

export interface ProjectionGlobaleResult {
  points:                  AnneeProjection[]
  ageIndependanceCentral:  number | null
  ecartObjectif:           number | null
  patrimoineAgeCible:      number
  rendementUtilise:        number      // rendement central financier (info)
  /** Détail à l'âge cible pour les 5 cartes résumé. */
  detailsAgeCible: {
    financier:           number
    equityImmoExistant:  number
    equityImmoFuture:    number
    cash:                number
    loyersNetsMensuels:  number
    mensualitesSortantes: number
    valeurBruteImmo:     number  // pour la carte "levier immobilier"
  }
  /** Warnings (ex : "apport insuffisant en année N"). */
  warnings: string[]
}

/** Inputs requis par la projection globale. */
export interface ProjectionInputs {
  ageActuel:                number
  ageCible:                 number
  revenuPassifCible:        number      // €/mois
  epargneMensuelle:         number      // DCA financier
  rendementCentral:         number      // % annuel financier
  appreciationImmoPct:      number      // %, applied to biens existants
  inflationLoyersPct:       number      // %, applied to all loyers
  patrimoineFinancierActuel: number     // totalPortefeuille
  cashActuel:               number      // totalCash
  biensExistants:           BienImmo[]
  acquisitionsFutures:      AcquisitionFuture[]
  horizonAnnees?:           number      // defaut 35
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

/** Statut visuel d'une déviation vs benchmark (cf. lib/analyse/benchmarks.ts). */
export type DeviationStatus = 'aligned' | 'overweight' | 'overweight_strong' | 'underweight'

/** Allocation sectorielle avec comparaison au benchmark MSCI World. */
export interface SecteurAlloc {
  secteur:       string          // libellé FR (ex: 'Technologie')
  valeur:        number
  pourcentage:   number          // % du portefeuille
  benchmark:     number          // % de référence MSCI World
  deviation:     number          // pourcentage − benchmark (en points)
  /** 'aligned' / 'overweight' (>+15) / 'overweight_strong' (>+30) / 'underweight' (<−20) */
  status:        DeviationStatus
  positions:     string[]        // noms des actifs sources (max 10 affichés)
  /** True quand status='overweight' ou 'overweight_strong' (surpondération réelle). */
  alerte:        boolean
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

/** Allocation géographique avec comparaison au benchmark MSCI ACWI. */
export interface GeoAlloc {
  zone:        string
  valeur:      number
  pourcentage: number          // % du portefeuille
  benchmark:   number          // % de référence MSCI ACWI
  deviation:   number          // pourcentage − benchmark (en points)
  status:      DeviationStatus
  pays:        string[]        // libellés bruts ou codes ISO
  /** True quand status='overweight' ou 'overweight_strong'. */
  alerte:      boolean
}

/** Snapshot complet du patrimoine d'un utilisateur, prêt à être affiché. */
export interface PatrimoineComplet {
  totalBrut:        number     // somme de tout (financier + immo + cash, hors dettes)
  totalNet:         number     // totalBrut - totalDettes
  totalPortefeuille: number    // actions + ETF + crypto + obligs (positions)
  totalImmo:        number     // valeur brute immobilier
  totalCash:        number     // tous les comptes / livrets
  totalDettes:      number     // capital restant dû tous crédits

  // Phase 8 — KPIs immobilier agrégés (utiles aux scores + UI)
  /** Equity totale immo = somme valeur − somme dettes. */
  totalImmoEquity:           number
  /** Risque pondéré immobilier (par valeur du bien) 0-75. */
  risqueImmoGlobal:          number
  /** Revenu passif net mensuel des biens LOCATIFS uniquement. */
  revenuPassifImmo:          number
  /** Total mensualités crédit immo (€/mois). */
  mensualitesImmoTotal:      number
  /** Rendement net moyen pondéré du parc immo (%). */
  rendementNetImmoMoyen:     number

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

  // ── Phase 4-6 — Expansion ETF + fiabilité + crypto séparée ───────
  /** Indicateur de fiabilité de l'analyse sectorielle/géo (denom = portef. hors crypto). */
  analyseFiabilite: AnalyseFiabilite
  /** ISIN d'ETF non référencés dans la table de compositions. */
  unmappedEtfs:     Array<{ isin: string; name: string; value: number }>
  /** Toutes les positions non identifiées (ETFs + actions sans data) pour
   *  que l'utilisateur puisse atteindre 100 % de fiabilité. */
  unmappedAll:      Array<{ isin: string; name: string; value: number; reason: string }>

  /** Valeur totale crypto du portefeuille (exclue de sect/geo). */
  cryptoTotal:      number
  /** Détail crypto pour la section dédiée — chaque ligne avec sa part. */
  cryptoBreakdown:  Array<{ isin: string; name: string; value: number; pct: number }>

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
  /** Explication détaillée pour la modal de détail (cliquer sur le score). */
  explanation?: ScoreExplanation
}

/** Détail d'un score affiché dans la modal au clic. */
export interface ScoreExplanation {
  /** Formule utilisée (texte humain, pas du code). */
  formule:    string
  /** Inputs concrets qui ont alimenté la formule (label → valeur affichable). */
  inputs:     Array<{ label: string; value: string; highlight?: boolean }>
  /** Lecture / interprétation : pourquoi ce niveau, quoi en faire. */
  lecture:    string
  /** Action concrète suggérée (optionnel — déjà couvert par les recos). */
  action?:    string
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
  Immobilier:   '#E8B84B',     // or
  Cash:         '#71717a',     // muted
  Obligataire:  '#F97316',     // orange
  Métaux:       '#facc15',     // jaune doré (or, argent, platine)
}
