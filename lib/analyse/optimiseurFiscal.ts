/**
 * Optimiseur fiscal personnalisé — chiffre en € les opportunités fiscales
 * accessibles à l'utilisateur selon sa situation réelle.
 *
 * 8 règles métier indépendantes, chacune produit une OpportuniteFiscale
 * applicable=true|false avec gain estimé annuel + 5 ans + action concrète.
 *
 * Pure (pas d'I/O). Consomme uniquement PatrimoineComplet (déjà chargé
 * par usePatrimoineAnalyse). Calculs 100 % client.
 *
 * Avertissement : les estimations sont indicatives. Disclaimer fiscal
 * obligatoire dans l'UI consommatrice (cf. components/analyse/OptimiseurFiscal.tsx).
 */

import type { PatrimoineComplet, BienImmo } from '@/types/analyse'
import {
  PRELEVEMENTS_SOCIAUX_PCT,
  PFU_PCT,
  AV_LONG_TERME_PCT,
  AV_ABATTEMENT_CELIBATAIRE,
  AV_ABATTEMENT_COUPLE,
  TMI_FALLBACK_PCT,
} from './constants'
import { findEnvelopeById } from '@/lib/profil/enveloppesConstants'

// ─────────────────────────────────────────────────────────────────
// Constantes fiscales (France 2026)
// ─────────────────────────────────────────────────────────────────

// Alias local conserve pour minimiser les changements ailleurs dans le fichier.
const PS_PCT = PRELEVEMENTS_SOCIAUX_PCT

// Re-export des constantes communes (depuis lib/analyse/constants.ts)
// pour que les imports historiques `from '@/lib/analyse/optimiseurFiscal'` continuent
// de fonctionner.
export { PFU_PCT, AV_LONG_TERME_PCT, AV_ABATTEMENT_CELIBATAIRE, AV_ABATTEMENT_COUPLE }

/** Plafond PEA en versements cumulés (hors PEA-PME). */
export const PEA_PLAFOND_VERSEMENTS = 150_000

/** Plafond PER déductible 2026 = 10 % des revenus d'activité, plafonné à 8 × PASS. */
export const PER_PLAFOND_ABSOLU_2026 = 35_194

/** Yield dividendes moyen estimé sur actions/ETF Europe (annuel %). */
const YIELD_DIVIDENDES_PCT = 2

/** Plafond Livret A. */
export const LIVRET_A_PLAFOND = 22_950

/** Plafond LDDS. */
export const LDDS_PLAFOND = 12_000

/** Plafond imputation déficit foncier sur revenu global (€/an). */
export const DEFICIT_FONCIER_PLAFOND_GLOBAL = 10_700

/** Rendement marché monétaire / fonds court terme (annuel %). */
const RENDEMENT_MONETAIRE_PCT = 3.5

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export type CategorieOpportunite = 'enveloppe' | 'immo' | 'per' | 'deficit' | 'holding'
export type EffortOpportunite    = 'faible' | 'moyen' | 'eleve'

export interface OpportuniteFiscale {
  id:                    string
  categorie:             CategorieOpportunite
  titre:                 string
  description:           string
  /** Gain annuel estimé (€). 0 si non applicable. */
  gain_annuel_eur:       number
  /** Gain cumulé estimé sur 5 ans (€). 0 si non applicable. */
  gain_5ans_eur:         number
  effort:                EffortOpportunite
  /** Priorité : 1 = urgent / 2 = important / 3 = à étudier. */
  priorite:              1 | 2 | 3
  /** Action concrète à entreprendre — phrase précise. */
  action_concrete:       string
  /** Liste des conditions remplies (checklist pour l'UI). */
  conditions:            string[]
  /** False = l'opportunité ne s'applique pas à cette situation. */
  applicable:            boolean
  /** Raison de non-applicabilité (affichée si applicable=false). */
  raison_non_applicable?: string
}

export interface ProfilFiscal {
  tmi_pct:                  number
  revenus_fonciers_annuels: number
  revenus_cto_annuels:      number
  enveloppes_ouvertes:      string[]
  enveloppes_manquantes:    string[]
  regime_immo_actuel:       string[]
  capacite_per_annuelle:    number
}

export interface OpportunitesFiscales {
  gain_total_estime_annuel: number
  gain_total_estime_5ans:   number
  opportunites:             OpportuniteFiscale[]
  profil_fiscal:            ProfilFiscal
}

export interface CalculerOpportunitesParams {
  patrimoine: PatrimoineComplet
}

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

/**
 * Calcule les opportunités fiscales pour un patrimoine donné.
 * Renvoie toujours les 8 opportunités, avec applicable=true|false +
 * gain chiffré pour chaque. L'UI filtre/affiche selon ce flag.
 */
export function calculerOpportunitesFiscales(
  params: CalculerOpportunitesParams,
): OpportunitesFiscales {
  const profil = construireProfilFiscal(params.patrimoine)

  const opps: OpportuniteFiscale[] = [
    evaluerPEA(params.patrimoine, profil),
    evaluerPER(params.patrimoine, profil),
    evaluerMicroFoncierVsReel(params.patrimoine, profil),
    evaluerLMNPMicroVsReel(params.patrimoine, profil),
    evaluerDeficitFoncier(params.patrimoine, profil),
    evaluerAssuranceVie(params.patrimoine, profil),
    evaluerCashOptimization(params.patrimoine, profil),
    evaluerDemembrement(params.patrimoine, profil),
  ]

  // Tri : applicables d'abord, puis par priorité ASC, puis par gain annuel DESC.
  opps.sort((a, b) => {
    if (a.applicable !== b.applicable) return a.applicable ? -1 : 1
    if (a.priorite !== b.priorite)     return a.priorite - b.priorite
    return b.gain_annuel_eur - a.gain_annuel_eur
  })

  const gainTotalAnnuel = opps
    .filter((o) => o.applicable)
    .reduce((s, o) => s + o.gain_annuel_eur, 0)
  const gainTotal5ans   = opps
    .filter((o) => o.applicable)
    .reduce((s, o) => s + o.gain_5ans_eur, 0)

  return {
    gain_total_estime_annuel: Math.round(gainTotalAnnuel),
    gain_total_estime_5ans:   Math.round(gainTotal5ans),
    opportunites:             opps,
    profil_fiscal:            profil,
  }
}

// ─────────────────────────────────────────────────────────────────
// Profil fiscal
// ─────────────────────────────────────────────────────────────────

// CS5 dette — Référence fiscale dérivée de ENVELOPPE_DEFS (source unique).
// Les "enveloppes fiscales" qu'on suggère d'ouvrir si manquantes = celles
// avec un fiscalTaxKey != null ET hors Livret A / LDDS / CEL / PEL qui sont
// déjà ouvertes par défaut côté banque française (et plafonnés).
const ENVELOPPES_FISCALES_RECOMMANDEES = ['pea', 'av', 'per', 'cto']

function construireProfilFiscal(p: PatrimoineComplet): ProfilFiscal {
  const fi  = p.fireInputs
  // Fallback uniforme avec fiscaliteImmo : 30% si TMI non renseignee
  // (etait 0 ici, ce qui masquait toutes les opportunites fiscales).
  // L'agregateur expose un flag `tmiEstime` pour que l'UI puisse alerter.
  const tmi = fi.tmi_rate ?? TMI_FALLBACK_PCT

  // CS5 dette — Match strict via ENVELOPPE_DEFS au lieu de substring lower.
  // On extrait les enveloppes "fiscales" effectivement ouvertes par l'user.
  const userLabels = new Set(fi.enveloppes ?? [])
  const enveloppesOuvertes: string[] = []
  for (const id of ENVELOPPES_FISCALES_RECOMMANDEES) {
    const def = findEnvelopeById(id)
    if (def && userLabels.has(def.label)) enveloppesOuvertes.push(def.label)
  }
  // Livret A / LDDS conservés dans la liste ouverte pour usage downstream.
  for (const id of ['livreta', 'ldds'] as const) {
    const def = findEnvelopeById(id)
    if (def && userLabels.has(def.label)) enveloppesOuvertes.push(def.label)
  }

  const enveloppesManquantes = ENVELOPPES_FISCALES_RECOMMANDEES
    .map((id) => findEnvelopeById(id)?.label)
    .filter((lbl): lbl is string => !!lbl && !enveloppesOuvertes.includes(lbl))

  // Revenus fonciers annuels = somme des loyers bruts annuels (locatifs)
  const revenusFonciers = p.biens
    .filter((b) => b.type !== 'Résidence principale' && b.loyer_mensuel > 0)
    .reduce((s, b) => s + b.loyer_mensuel * 12, 0)

  // Revenus CTO annuels = dividendes estimés sur actions/ETF si pas de PEA,
  // sinon estimation conservatrice basée sur la part actions hors PEA-éligible
  const valActionsEtf = p.positions
    .filter((pos) => pos.asset_type === 'stock' || pos.asset_type === 'etf')
    .reduce((s, pos) => s + pos.current_value, 0)
  // Si PEA fermé : tout est en CTO → dividendes sur la totalité.
  // Si PEA ouvert : on suppose qu'une partie reste en CTO (actions non-EU, etc.).
  const peaLabel     = findEnvelopeById('pea')?.label ?? 'PEA'
  const partCto      = userLabels.has(peaLabel) ? 0.3 : 1
  const revenusCto   = valActionsEtf * partCto * (YIELD_DIVIDENDES_PCT / 100)

  // Régimes immo actifs (uniques)
  const regimes = new Set<string>()
  for (const b of p.biens) {
    const r = (b.fiscal_regime ?? '').trim()
    if (r) regimes.add(r)
  }

  // Capacité PER annuelle = min(10 % revenus, plafond absolu)
  const revenusActivite        = fi.revenu_mensuel_total * 12
  const plafondPerNominal      = revenusActivite * 0.10
  const capacitePerAnnuelle    = Math.min(plafondPerNominal, PER_PLAFOND_ABSOLU_2026)

  return {
    tmi_pct:                  tmi,
    revenus_fonciers_annuels: Math.round(revenusFonciers),
    revenus_cto_annuels:      Math.round(revenusCto),
    enveloppes_ouvertes:      enveloppesOuvertes,
    enveloppes_manquantes:    enveloppesManquantes,
    regime_immo_actuel:       Array.from(regimes),
    capacite_per_annuelle:    Math.max(0, Math.round(capacitePerAnnuelle)),
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_1 — Ouverture / maximisation PEA
// ─────────────────────────────────────────────────────────────────

function evaluerPEA(p: PatrimoineComplet, profil: ProfilFiscal): OpportuniteFiscale {
  const peaOuvert = profil.enveloppes_ouvertes.includes('PEA')
  const tmi       = profil.tmi_pct

  // Valeur actions/ETF totale
  const valActions = p.positions
    .filter((pos) => pos.asset_type === 'stock' || pos.asset_type === 'etf')
    .reduce((s, pos) => s + pos.current_value, 0)

  // Dividendes annuels estimés (toujours imposés à la flat tax en CTO)
  const dividendesCto = profil.revenus_cto_annuels

  // Estimation des PV qui seraient réalisées chaque année si le portefeuille
  // restait en CTO. HYPOTHÈSE : l'utilisateur réalise SES gains chaque année
  // (turnover 100 % = réinvestissement annuel, conservative — sans cela on
  // sous-estime fortement l'avantage long-terme du PEA, qui capitalise sans
  // friction fiscale jusqu'aux retraits après 5 ans).
  // Avant : `valActions × 0.20 × 0.07` = turnover fictif 20 % × rendement 7 %,
  // qui sous-évaluait le gain PEA d'un facteur 3 à 5.
  const RENDEMENT_ESTIME = 0.07
  const pvAnnuellesEstimees = peaOuvert ? 0 : valActions * RENDEMENT_ESTIME
  const baseImposable       = dividendesCto + pvAnnuellesEstimees

  // Gain annuel = différentiel (PFU 30 %) − (PEA après 5 ans = 17,2 % PS uniquement)
  const gainAnnuel = baseImposable * ((PFU_PCT - PS_PCT) / 100)

  const applicable = (
    !peaOuvert && valActions >= 5_000
  ) || (
    peaOuvert && valActions >= 30_000 && tmi >= 11
  )

  let raison: string | undefined
  if (!applicable) {
    raison = !peaOuvert && valActions < 5_000
      ? 'PEA pas encore nécessaire : moins de 5 000 € d\'actions/ETF.'
      : 'PEA suffisamment alimenté ou portefeuille actions limité.'
  }

  return {
    id:        'opp_pea',
    categorie: 'enveloppe',
    titre:     peaOuvert ? 'Optimiser votre PEA' : 'Ouvrir un PEA',
    description: peaOuvert
      ? 'Vous détenez des actions/ETF en CTO alors qu\'une partie pourrait être transférée vers votre PEA. Après 5 ans d\'ouverture, les plus-values et dividendes ne sont taxés qu\'aux prélèvements sociaux (17,2 %) au lieu du PFU (30 %).'
      : 'Sans PEA, vos actions et ETF sont soumis à la flat tax de 30 % sur les plus-values et dividendes. Avec un PEA ouvert depuis 5 ans, vous économisez 12,8 points de fiscalité.',
    gain_annuel_eur:  Math.round(applicable ? gainAnnuel : 0),
    gain_5ans_eur:    Math.round(applicable ? gainAnnuel * 5 : 0),
    effort:           'faible',
    priorite:         (gainAnnuel > 200 || !peaOuvert) ? 1 : 2,
    action_concrete:  peaOuvert
      ? `Transférez progressivement vos ETF éligibles depuis votre CTO vers votre PEA (plafond ${PEA_PLAFOND_VERSEMENTS.toLocaleString('fr-FR')} € de versements). Économie estimée : ${Math.round(gainAnnuel)} €/an après 5 ans.`
      : `Ouvrez un PEA chez un courtier en ligne (Boursorama, Fortuneo, BforBank…) dès maintenant — le délai fiscal de 5 ans démarre à l'ouverture, même avec un dépôt minimal.`,
    conditions: [
      peaOuvert ? 'PEA déjà ouvert' : 'PEA non ouvert',
      `${Math.round(valActions).toLocaleString('fr-FR')} € d'actions/ETF détenus`,
      `TMI déclarée : ${tmi} %`,
    ],
    applicable,
    raison_non_applicable: raison,
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_2 — Maximisation PER
// ─────────────────────────────────────────────────────────────────

function evaluerPER(p: PatrimoineComplet, profil: ProfilFiscal): OpportuniteFiscale {
  const tmi      = profil.tmi_pct
  const capacite = profil.capacite_per_annuelle
  // Versement annuel modélisé : on suppose que l'utilisateur peut verser
  // jusqu'à min(capacité, 10 000 €) sur l'année courante.
  const versement = Math.min(capacite, 10_000)
  const gainAnnuel = versement * (tmi / 100)

  const applicable = tmi >= 11 && capacite >= 1_000
  const raison = !applicable
    ? (tmi < 11
        ? 'TMI trop faible pour rendre le PER avantageux (≤ 11 %).'
        : 'Capacité PER insuffisante (revenus d\'activité < 10 000 €/an).')
    : undefined

  return {
    id:        'opp_per',
    categorie: 'per',
    titre:     'Maximiser les versements PER',
    description: `Le PER déduit vos versements de votre revenu imposable dans la limite de 10 % de vos revenus d'activité (plafond 2026 : ${PER_PLAFOND_ABSOLU_2026.toLocaleString('fr-FR')} €). À TMI ${tmi} %, chaque 1 000 € versés vous économise ${10 * tmi} € d'impôts immédiatement.`,
    gain_annuel_eur:  Math.round(applicable ? gainAnnuel : 0),
    gain_5ans_eur:    Math.round(applicable ? gainAnnuel * 5 : 0),
    effort:           'faible',
    priorite:         tmi >= 30 ? 1 : 2,
    action_concrete:  `Versez ${versement.toLocaleString('fr-FR')} € sur votre PER avant le 31/12 pour économiser ${Math.round(gainAnnuel).toLocaleString('fr-FR')} € d'impôts sur le revenu cette année. Capacité disponible estimée : ${capacite.toLocaleString('fr-FR')} €.`,
    conditions: [
      `TMI ${tmi} %`,
      `Capacité PER estimée : ${capacite.toLocaleString('fr-FR')} €/an`,
      `PER ${profil.enveloppes_ouvertes.includes('PER') ? 'déjà ouvert' : 'à ouvrir'}`,
    ],
    applicable,
    raison_non_applicable: raison,
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_3 — Micro-foncier → réel
// ─────────────────────────────────────────────────────────────────

function evaluerMicroFoncierVsReel(p: PatrimoineComplet, profil: ProfilFiscal): OpportuniteFiscale {
  const tmi = profil.tmi_pct
  // Cherche les biens en micro-foncier
  const biensMicro = p.biens.filter((b) =>
    isRegime(b, ['foncier_micro', 'micro_foncier', 'micro foncier']),
  )

  if (biensMicro.length === 0) {
    return {
      id:        'opp_micro_foncier',
      categorie: 'immo',
      titre:     'Passage au régime réel (foncier)',
      description: 'Le régime réel permet de déduire vos charges réelles si elles dépassent 30 % de vos loyers (abattement du micro-foncier).',
      gain_annuel_eur:  0, gain_5ans_eur: 0,
      effort:           'moyen',
      priorite:         3,
      action_concrete:  '—',
      conditions:       [],
      applicable:       false,
      raison_non_applicable: 'Aucun bien actuellement au régime micro-foncier.',
    }
  }

  let gainTotal = 0
  let detailsBien = ''
  for (const b of biensMicro) {
    const loyersAn      = b.loyer_mensuel * 12
    const chargesAn     = b.charges_annuelles
    const ratioCharges  = loyersAn > 0 ? chargesAn / loyersAn : 0

    // Si charges < 30 %, le micro est plus avantageux → skip
    if (ratioCharges <= 0.30) continue

    // Base imposable micro = loyers × 0,7
    const baseMicro     = loyersAn * 0.7
    // Base imposable réel = loyers − charges (sans intérêts pour simplifier)
    const baseReel      = Math.max(0, loyersAn - chargesAn)
    const imp           = (tmi + PS_PCT) / 100
    const impotMicro    = baseMicro * imp
    const impotReel     = baseReel  * imp
    const gainBien      = impotMicro - impotReel
    if (gainBien > 0) {
      gainTotal  += gainBien
      detailsBien = `${b.nom}${b.ville ? ' (' + b.ville + ')' : ''} : ${Math.round(loyersAn).toLocaleString('fr-FR')} € de loyers avec ${Math.round(chargesAn).toLocaleString('fr-FR')} € de charges (${(ratioCharges * 100).toFixed(0)} %)`
    }
  }

  const applicable = gainTotal > 100  // seuil minimum significatif

  return {
    id:        'opp_micro_foncier',
    categorie: 'immo',
    titre:     'Passer du micro-foncier au régime réel',
    description: `Le micro-foncier applique un abattement forfaitaire de 30 % sur vos loyers. Si vos charges réelles (taxe foncière, copro, travaux, gestion) dépassent ce seuil, le régime réel devient plus avantageux.`,
    gain_annuel_eur:  Math.round(gainTotal),
    gain_5ans_eur:    Math.round(gainTotal * 5),
    effort:           'moyen',
    priorite:         2,
    action_concrete:  applicable && detailsBien
      ? `${detailsBien}. Le régime réel vous économiserait ${Math.round(gainTotal).toLocaleString('fr-FR')} €/an vs micro-foncier. Option à exercer auprès des impôts avant le 1er février (irrévocable 3 ans).`
      : 'Le régime micro reste plus avantageux pour vos biens actuels (charges < 30 % des loyers).',
    conditions: [
      `${biensMicro.length} bien(s) au régime micro-foncier`,
      `TMI ${tmi} %`,
    ],
    applicable,
    raison_non_applicable: applicable
      ? undefined
      : 'Vos charges réelles ne dépassent pas le seuil de 30 % des loyers : le micro reste plus avantageux.',
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_4 — LMNP micro → réel (avec amortissement)
// ─────────────────────────────────────────────────────────────────

function evaluerLMNPMicroVsReel(p: PatrimoineComplet, profil: ProfilFiscal): OpportuniteFiscale {
  const tmi = profil.tmi_pct
  const biensLmnpMicro = p.biens.filter((b) =>
    isRegime(b, ['lmnp_micro', 'lmnp micro']),
  )

  if (biensLmnpMicro.length === 0) {
    return {
      id:        'opp_lmnp_reel',
      categorie: 'immo',
      titre:     'Passage LMNP au régime réel',
      description: 'Le LMNP réel permet d\'amortir le bien (bâti / mobilier) en plus de déduire les charges réelles. Indispensable si charges + amortissement > 50 % des loyers.',
      gain_annuel_eur:  0, gain_5ans_eur: 0,
      effort:           'eleve',
      priorite:         3,
      action_concrete:  '—',
      conditions:       [],
      applicable:       false,
      raison_non_applicable: 'Aucun bien actuellement au régime LMNP micro.',
    }
  }

  let gainTotal     = 0
  let detailsBien   = ''
  for (const b of biensLmnpMicro) {
    const loyersAn       = b.loyer_mensuel * 12
    const chargesAn      = b.charges_annuelles
    // Amortissement estimé : bâti / 25 ans (on suppose bâti = 85 % de la valeur)
    const valeurBati     = b.valeur * 0.85
    const amortissement  = valeurBati / 25

    // Base micro LMNP = loyers × 0,5 (abattement 50 %)
    const baseMicro      = loyersAn * 0.5
    // Base réel LMNP = loyers − charges − amortissement (peut être négatif → 0)
    const baseReel       = Math.max(0, loyersAn - chargesAn - amortissement)
    // LMNP réel : pas de PS sur le BIC non-pro (simplification)
    const impotMicro     = baseMicro * ((tmi + PS_PCT) / 100)
    const impotReel      = baseReel  * (tmi / 100)
    const gainBien       = impotMicro - impotReel
    if (gainBien > 100) {
      gainTotal += gainBien
      detailsBien = `${b.nom}${b.ville ? ' (' + b.ville + ')' : ''} : amortissement annuel estimé ${Math.round(amortissement).toLocaleString('fr-FR')} €`
    }
  }

  const applicable = gainTotal > 200

  return {
    id:        'opp_lmnp_reel',
    categorie: 'immo',
    titre:     'Passer du LMNP micro au LMNP réel',
    description: `Le LMNP réel permet d'amortir comptablement votre bien (bâti, mobilier, travaux) en plus de déduire vos charges réelles. L'amortissement n'est pas une sortie de cash mais réduit drastiquement votre base imposable.`,
    gain_annuel_eur:  Math.round(gainTotal),
    gain_5ans_eur:    Math.round(gainTotal * 5),
    effort:           'eleve',  // nécessite un comptable
    priorite:         tmi >= 30 ? 1 : 2,
    action_concrete:  applicable && detailsBien
      ? `${detailsBien}. Le LMNP réel pourrait économiser ${Math.round(gainTotal).toLocaleString('fr-FR')} €/an. Consultez un expert-comptable spécialisé (~500 €/an de frais comptables).`
      : 'Le LMNP micro reste plus avantageux pour vos biens actuels.',
    conditions: [
      `${biensLmnpMicro.length} bien(s) en LMNP micro`,
      `TMI ${tmi} %`,
    ],
    applicable,
    raison_non_applicable: applicable
      ? undefined
      : 'Le gain potentiel ne justifie pas les frais comptables (~500 €/an).',
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_5 — Déficit foncier exploitable
// ─────────────────────────────────────────────────────────────────

function evaluerDeficitFoncier(p: PatrimoineComplet, profil: ProfilFiscal): OpportuniteFiscale {
  const tmi = profil.tmi_pct
  const biensReel = p.biens.filter((b) => isRegime(b, ['foncier_nu', 'foncier_reel', 'reel']))

  let deficitTotal = 0
  let detailsBien  = ''
  for (const b of biensReel) {
    const loyersAn  = b.loyer_mensuel * 12
    const chargesAn = b.charges_annuelles
    const deficit   = Math.max(0, chargesAn - loyersAn)
    if (deficit > 0) {
      deficitTotal += deficit
      detailsBien   = `${b.nom}${b.ville ? ' (' + b.ville + ')' : ''} : charges ${Math.round(chargesAn).toLocaleString('fr-FR')} € − loyers ${Math.round(loyersAn).toLocaleString('fr-FR')} €`
    }
  }

  if (deficitTotal === 0) {
    return {
      id:        'opp_deficit_foncier',
      categorie: 'deficit',
      titre:     'Exploiter le déficit foncier',
      description: 'Le déficit foncier permet d\'effacer du revenu imposable jusqu\'à 10 700 €/an (régime réel uniquement).',
      gain_annuel_eur:  0, gain_5ans_eur: 0,
      effort:           'moyen',
      priorite:         3,
      action_concrete:  '—',
      conditions:       [],
      applicable:       false,
      raison_non_applicable: biensReel.length === 0
        ? 'Aucun bien au régime foncier réel.'
        : 'Vos biens au réel sont équilibrés ou bénéficiaires (pas de déficit).',
    }
  }

  // Imputation : d'abord sur revenus fonciers, puis sur revenu global (plafond 10 700 €)
  const imputableFoncier = Math.min(deficitTotal, profil.revenus_fonciers_annuels)
  const reste            = deficitTotal - imputableFoncier
  const imputableGlobal  = Math.min(reste, DEFICIT_FONCIER_PLAFOND_GLOBAL)
  // Le déficit foncier réduit l'IR mais aussi les PS sur les revenus fonciers
  const gainAnnuel       = (imputableFoncier * (tmi + PS_PCT) / 100)
                         + (imputableGlobal  * tmi / 100)

  return {
    id:        'opp_deficit_foncier',
    categorie: 'deficit',
    titre:     'Exploiter votre déficit foncier',
    description: `Vos charges immobilières dépassent vos loyers. Ce déficit s'impute sur vos revenus fonciers de l'année, puis sur votre revenu global jusqu'à ${DEFICIT_FONCIER_PLAFOND_GLOBAL.toLocaleString('fr-FR')} €/an. Le reliquat est reportable sur les 10 années suivantes.`,
    gain_annuel_eur:  Math.round(gainAnnuel),
    gain_5ans_eur:    Math.round(gainAnnuel * 1.5),  // se réduit dans le temps
    effort:           'moyen',
    priorite:         1,
    action_concrete:  detailsBien
      ? `${detailsBien}. Déficit de ${Math.round(deficitTotal).toLocaleString('fr-FR')} € à déclarer sur le formulaire 2044 — économie d'impôts ${Math.round(gainAnnuel).toLocaleString('fr-FR')} € cette année.`
      : `Déclarez votre déficit foncier sur le formulaire 2044.`,
    conditions: [
      `${biensReel.length} bien(s) au régime foncier réel`,
      `Déficit cumulé : ${Math.round(deficitTotal).toLocaleString('fr-FR')} €`,
      `TMI ${tmi} %`,
    ],
    applicable: true,
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_6 — Assurance Vie (arbitrage AV / CTO)
// ─────────────────────────────────────────────────────────────────

function evaluerAssuranceVie(p: PatrimoineComplet, profil: ProfilFiscal): OpportuniteFiscale {
  const avOuverte = profil.enveloppes_ouvertes.includes('Assurance-vie')
  const tmi       = profil.tmi_pct

  // Gains latents estimés sur le portefeuille (sert au libellé "potentiel arbitrable")
  const gainsLatents = p.positions
    .filter((pos) => pos.asset_type === 'stock' || pos.asset_type === 'etf')
    .reduce((s, pos) => s + Math.max(0, pos.gain_loss), 0)

  // Gain réaliste de l'AV vs CTO après 8 ans :
  // = abattement annuel × TMI (impôt économisé sur les retraits exonérés).
  // Avant : `gainsLatents × (PFU − AV_LT) / 100` taxait des PV LATENTES qui ne
  // sont imposées qu'à la sortie — l'horizon était factice et le gain surestimé.
  // L'abattement (4 600 € / 9 200 €) est annuel et utilisable même hors arbitrage.
  // L'AV doit avoir 8+ ans pour activer l'abattement ; sans date persistée
  // dans `fireInputs`, on suppose ici que l'utilisateur soit l'a déjà,
  // soit ouvre maintenant pour disposer de cet avantage dans 8 ans.
  // Abattement célibataire par défaut (situation familiale non exposée dans fireInputs).
  const abattementAnnuel = AV_ABATTEMENT_CELIBATAIRE
  const gainAnnuel       = avOuverte ? abattementAnnuel * (tmi / 100) : 0

  const applicable = avOuverte && tmi >= 11

  return {
    id:        'opp_assurance_vie',
    categorie: 'enveloppe',
    titre:     avOuverte ? 'Arbitrer vos gains via AV' : 'Ouvrir une Assurance-vie',
    description: avOuverte
      ? `Après 8 ans, votre AV bénéficie d'un abattement annuel de ${AV_ABATTEMENT_CELIBATAIRE.toLocaleString('fr-FR')} € (célibataire) ou 9 200 € (couple) sur les retraits, et d'un taux global de ${AV_LONG_TERME_PCT} % vs ${PFU_PCT} % en CTO.`
      : `L'AV est l'enveloppe la plus flexible : transmission privilégiée (152 500 € par bénéficiaire), abattement après 8 ans, fiscalité réduite. Ouvrir même avec 100 € fait courir le délai.`,
    gain_annuel_eur:  Math.round(gainAnnuel),
    gain_5ans_eur:    Math.round(gainAnnuel * 5),
    effort:           'faible',
    priorite:         avOuverte ? 2 : 3,
    action_concrete:  avOuverte && gainsLatents > 0
      ? `Vous avez ${Math.round(gainsLatents).toLocaleString('fr-FR')} € de plus-values latentes. Réalisez-les progressivement via votre AV pour économiser ${Math.round(gainAnnuel).toLocaleString('fr-FR')} €/an de fiscalité par rapport au CTO.`
      : `Ouvrez une AV chez Linxea, Yomoni ou Boursorama avec 100 € — l'abattement après 8 ans démarre dès aujourd'hui.`,
    conditions: [
      avOuverte ? 'AV déjà ouverte' : 'AV non ouverte',
      `${Math.round(gainsLatents).toLocaleString('fr-FR')} € de PV latentes sur actions/ETF`,
    ],
    applicable,
    raison_non_applicable: !applicable
      ? (!avOuverte
          ? 'AV non encore ouverte — démarrez le compteur dès aujourd\'hui.'
          : 'TMI trop faible (≤ 11 %) pour rendre l\'arbitrage AV vs CTO significatif.')
      : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_7 — Optimisation cash (Livret A / LDDS / fonds monétaire)
// ─────────────────────────────────────────────────────────────────

function evaluerCashOptimization(p: PatrimoineComplet, _profil: ProfilFiscal): OpportuniteFiscale {
  // Cash sur compte courant (rendement 0)
  const compteCourant = p.comptes
    .filter((c) => c.type === 'compte_courant')
    .reduce((s, c) => s + c.solde, 0)
  // Cash total
  const cashTotal = p.totalCash
  // Plafonds disponibles
  const plafondsDispo = LIVRET_A_PLAFOND + LDDS_PLAFOND  // 34 950 €
  // Excédent sur compte courant qu'on peut placer en livrets puis monétaire
  const excedentCC = Math.max(0, compteCourant - 1_500)  // garder 1,5k€ pour trésorerie

  // Gain : on suppose qu'on place tout au-dessus de 1,5k€ sur Livret A (3 %)
  // puis LDDS (3 %), puis fonds monétaire (3,5 %). Pour simplifier :
  const gainAnnuel = excedentCC * (RENDEMENT_MONETAIRE_PCT / 100)

  const applicable = compteCourant > 5_000 || cashTotal > plafondsDispo

  return {
    id:        'opp_cash_optim',
    categorie: 'enveloppe',
    titre:     'Optimiser votre cash dormant',
    description: `Votre compte courant ne rapporte rien. Le Livret A (${LIVRET_A_PLAFOND.toLocaleString('fr-FR')} €) et le LDDS (${LDDS_PLAFOND.toLocaleString('fr-FR')} €) versent 3 % nets d'impôts. Au-delà, un fonds monétaire offre 3,5 % bruts.`,
    gain_annuel_eur:  Math.round(applicable ? gainAnnuel : 0),
    gain_5ans_eur:    Math.round(applicable ? gainAnnuel * 5 : 0),
    effort:           'faible',
    priorite:         2,
    action_concrete:  applicable
      ? `Vous avez ${Math.round(compteCourant).toLocaleString('fr-FR')} € sur votre compte courant. Conservez 1 500 € pour la trésorerie, basculez le reste sur Livret A / LDDS, puis ${cashTotal > plafondsDispo ? `placez l'excédent (~${Math.round(cashTotal - plafondsDispo).toLocaleString('fr-FR')} €) ` : ''}en fonds monétaire (3,5 %). Gain estimé : ${Math.round(gainAnnuel).toLocaleString('fr-FR')} €/an.`
      : 'Votre cash est déjà bien placé.',
    conditions: [
      `Compte courant : ${Math.round(compteCourant).toLocaleString('fr-FR')} €`,
      `Cash total : ${Math.round(cashTotal).toLocaleString('fr-FR')} €`,
      `Plafonds Livret A + LDDS : ${plafondsDispo.toLocaleString('fr-FR')} €`,
    ],
    applicable,
    raison_non_applicable: !applicable
      ? 'Votre compte courant n\'a pas d\'excédent significatif et vos livrets sont sous les plafonds.'
      : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────
// OPP_8 — Démembrement / transmission anticipée
// ─────────────────────────────────────────────────────────────────

function evaluerDemembrement(p: PatrimoineComplet, _profil: ProfilFiscal): OpportuniteFiscale {
  const patrimoineNet = p.totalNet
  const age           = p.fireInputs.age ?? 0

  // Biens immobiliers en pleine propriété (équity > 0)
  const valeurImmoEnPP = p.biens
    .filter((b) => b.equity > 0)
    .reduce((s, b) => s + b.equity, 0)

  // Taux d'usufruit selon l'âge (barème fiscal article 669 CGI, simplifié)
  // 61-70 ans : nue-prop = 60 %, usufruit = 40 %
  // 51-60 ans : nue-prop = 50 %, usufruit = 50 %
  // 41-50 ans : nue-prop = 40 %, usufruit = 60 %
  // 31-40 ans : nue-prop = 30 %, usufruit = 70 %
  const tauxUsufruit = age >= 61 ? 0.40
                     : age >= 51 ? 0.50
                     : age >= 41 ? 0.60
                     : 0.70

  // Économie réelle = droits de succession évités sur la PART DE NUE-PROPRIÉTÉ
  // donnée. Calcul par BARÈME PROGRESSIF parent→enfant + abattement de
  // 100 000 €/enfant tous les 15 ans (art. 779 CGI). L'ancien code utilisait
  // un taux moyen 20 % en dur qui était faux pour ~80 % des cas (avant
  // abattement, les premières tranches sont à 5–10 %, après abattement la
  // base imposable peut être nulle).
  const ABATTEMENT_PARENT_ENFANT = 100_000
  // Donations déjà réalisées non exposées dans `PatrimoineComplet` aujourd'hui.
  // On utilise 0 (abattement plein) avec une note pour l'utilisateur.
  const donationsDejaRealisees = 0
  const abattementRestant      = Math.max(0, ABATTEMENT_PARENT_ENFANT - donationsDejaRealisees)

  // Base = valeur de la nue-propriété transmise (et non valeur en pleine
  // propriété — c'est l'avantage clé du démembrement)
  const nuePropTransmise = (1 - tauxUsufruit) * valeurImmoEnPP
  const baseImposable    = Math.max(0, nuePropTransmise - abattementRestant)
  const gainTransmission = droitsSuccession(baseImposable)

  const applicable = patrimoineNet >= 500_000 && age >= 45 && valeurImmoEnPP > 100_000

  // On donne ce gain sur 5 ans (planification long terme)
  const gainAnnuelEquivalent = Math.round(gainTransmission / 10)  // amorti sur 10 ans

  return {
    id:        'opp_demembrement',
    categorie: 'holding',
    titre:     'Anticiper la transmission par démembrement',
    description: `La donation de la nue-propriété (en gardant l'usufruit) permet de transmettre à vos enfants à valeur réduite selon l'article 669 du CGI. À votre âge, la nue-propriété représente ${Math.round((1 - tauxUsufruit) * 100)} % de la valeur du bien, soit autant de droits évités.`,
    gain_annuel_eur:  applicable ? gainAnnuelEquivalent : 0,
    gain_5ans_eur:    applicable ? Math.round(gainTransmission / 2) : 0,
    effort:           'eleve',
    priorite:         3,
    action_concrete:  applicable
      ? `Avec ${Math.round(patrimoineNet).toLocaleString('fr-FR')} € de patrimoine net dont ${Math.round(valeurImmoEnPP).toLocaleString('fr-FR')} € en immobilier, le démembrement pourrait économiser ~${Math.round(gainTransmission).toLocaleString('fr-FR')} € de droits de succession à terme (hypothèse : abattement parent→enfant de 100 000 € non encore utilisé — renseigne tes donations passées pour affiner). Consultez un notaire pour une stratégie sur mesure.`
      : 'Démembrement non prioritaire selon votre situation.',
    conditions: [
      `Patrimoine net : ${Math.round(patrimoineNet).toLocaleString('fr-FR')} €`,
      `Âge : ${age} ans (taux usufruit ${Math.round(tauxUsufruit * 100)} %)`,
      `Immobilier en PP : ${Math.round(valeurImmoEnPP).toLocaleString('fr-FR')} €`,
      `Abattement restant supposé : ${ABATTEMENT_PARENT_ENFANT.toLocaleString('fr-FR')} €/enfant (15 ans)`,
    ],
    applicable,
    raison_non_applicable: !applicable
      ? (patrimoineNet < 500_000
          ? 'Patrimoine net insuffisant (< 500 k€) pour rendre la planification successorale prioritaire.'
          : age < 45
          ? 'Âge inférieur à 45 ans — démembrement à étudier plus tard pour optimiser le barème.'
          : 'Pas suffisamment d\'immobilier détenu en pleine propriété.')
      : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Barème progressif des droits de succession en ligne directe (parent → enfant).
 * Application APRÈS abattement (100 000 €/enfant tous les 15 ans).
 * Source : art. 777 CGI.
 *
 *   0–8 072 €      : 5 %
 *   8 072–12 109   : 10 %
 *   12 109–15 932  : 15 %
 *   15 932–552 324 : 20 %
 *   552 324–902 838: 30 %
 *   902 838–1 805 677: 40 %
 *   > 1 805 677    : 45 %
 */
export function droitsSuccession(base: number): number {
  if (base <= 0) return 0
  if (base <= 8_072)     return base * 0.05
  if (base <= 12_109)    return 403.6   + (base - 8_072)    * 0.10
  if (base <= 15_932)    return 807.3   + (base - 12_109)   * 0.15
  if (base <= 552_324)   return 1_380.75 + (base - 15_932)  * 0.20
  if (base <= 902_838)   return 88_677.35 + (base - 552_324) * 0.30
  if (base <= 1_805_677) return 193_831.55 + (base - 902_838) * 0.40
  return 555_007.35 + (base - 1_805_677) * 0.45
}

// Sprint 2 — D10 : helper isRegime centralise dans regimeFiscalImmo.ts.
// On re-exporte ici pour conserver la surface d'API privee de ce module
// (consommateurs internes appellent isRegime directement).
import { isRegime as isRegimeShared } from './regimeFiscalImmo'
function isRegime(bien: BienImmo, regimes: ReadonlyArray<string>): boolean {
  return isRegimeShared(bien, regimes)
}

