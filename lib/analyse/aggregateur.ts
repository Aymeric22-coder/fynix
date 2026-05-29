/**
 * Agrégateur patrimonial central — combine positions + immobilier + cash
 * + profil + dettes en un objet `PatrimoineComplet` prêt à être consommé
 * par le dashboard d'analyse.
 *
 * Toutes les valeurs sont normalisées en EUR (via lib/providers/fx pour
 * les positions en devises étrangères).
 *
 * Aucune logique UI ici : c'est une lib serveur pure. La page /analyse
 * et l'API /api/analyse/patrimoine sont les seuls consommateurs.
 */

import { createServerClient } from '@/lib/supabase/server'
import { toEur } from '@/lib/providers/fx'
import { getEnrichedPositions } from './enrichPositions'
import { geoZone } from './geoMapping'
import { calculerTousLesScores } from './scores'
import { genererRecommandations } from './recommandations'
import { expandPositions, bucketsBySector, bucketsByZone, type ExpansionResult } from './expandETF'
import { projectionGlobale, projectionFIREIntervalle, calculerRendementPortefeuille } from './projectionFIRE'
import { INFLATION_DEFAUT_PCT } from './projectionFIRE'
import {
  swrPctFromFireType, calculerCiblePatrimoine, RENDEMENT_PAR_CLASSE,
} from './constants'
import { devLog, devWarn } from '@/lib/utils/devLog'
import { getEtfComposition } from './etfCompositions'
import {
  benchmarkGeoOf, benchmarkSectorOf, classifyDeviation, trackingErrorScore,
  BENCHMARK_GEO_MSCI_ACWI, BENCHMARK_SECTOR_MSCI_WORLD,
} from './benchmarks'
import {
  calculerRisqueImmoGlobal, calculerRevenuPassifImmo,
  rendementNetMoyenPondere,
} from './immoCalculs'
import { computeRealEstatePortfolio } from '@/lib/real-estate/portfolio'
import { buildBienImmoFromSimulation } from './immoFromSimulation'
import type {
  PatrimoineComplet, BienImmo, CompteCash,
  ClasseAlloc, SecteurAlloc, GeoAlloc, EnrichedPosition, AnalyseAssetType,
  AnalyseFiabilite,
} from '@/types/analyse'
import type { CurrencyCode } from '@/types/database.types'
import { CLASSE_COLOR } from '@/types/analyse'

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return isFinite(n) ? n : 0
}

// ─────────────────────────────────────────────────────────────────
// Immobilier
//
// V4 — Le calcul des KPIs immo a été délégué au moteur unique
// `lib/real-estate/portfolio.ts > computeRealEstatePortfolio`. Les
// anciennes interfaces ImmoRow / DebtRow / LotRow / PropertyChargeRow
// et le helper `estimerDureeRestante` ont été supprimés (le moteur
// charge directement ces données + calcule la durée restante via le
// schedule analytique). Cf. `lib/analyse/immoFromSimulation.ts` pour
// le mapping PropertySimResult → BienImmo.
// ─────────────────────────────────────────────────────────────────

// Sprint 2 — D10 : remplace par fiscalRegimeLabel (lib/analyse/regimeFiscalImmo).
// On garde une map locale "type d'usage" plus generique que les labels fiscaux
// car l'UI veut afficher "Locatif" / "Résidence principale" plutot que le nom
// du regime.
import { normalizeFiscalRegime } from './regimeFiscalImmo'
function inferTypeUsageFromRegime(regime: string | null | undefined): string {
  const norm = normalizeFiscalRegime(regime)
  switch (norm) {
    case 'rp':              return 'Résidence principale'
    case 'foncier_micro':   return 'Locatif nu'
    case 'foncier_nu':      return 'Locatif nu'
    case 'lmnp_micro':      return 'Locatif (LMNP)'
    case 'lmnp_reel':       return 'Locatif (LMNP)'
    case 'lmp':             return 'Locatif (LMP)'
    case 'sci_ir':          return 'Locatif (SCI IR)'
    case 'sci_is':          return 'Locatif (SCI IS)'
    case 'scpi':            return 'SCPI'
    case 'meuble_tourisme': return 'Meublé de tourisme'
    default:                return 'Immobilier'
  }
}

interface ImmoLoadResult {
  biens:                BienImmo[]
  totalImmo:            number   // valeur brute
  totalDettes:          number   // capital restant dû
  loyersMensuels:       number   // loyers bruts mensuels (info)
  totalImmoEquity:      number
  risqueImmoGlobal:     number
  revenuPassifImmo:     number   // somme cashflows locatifs (peut être négatif)
  mensualitesImmoTotal: number
  rendementNetImmoMoyen: number
}

/**
 * V4 — Source unique : convergence /analyse sur le moteur lib/real-estate/.
 *
 * Avant V4, cette fonction calculait ses propres KPIs (rendements, cashflow,
 * impôt) avec un moteur fiscal SÉPARÉ (lib/analyse/fiscaliteImmo.ts) sans
 * amortissement multi-année, sans carry-forward, sans différé, sans
 * multi-crédit. Conséquence : le `cashflow_net_fiscal` de /analyse différait
 * de celui de la fiche détail (bugs BUG-007/008, INCOH-002/003/004 de
 * .audit/AUDIT_ETAT_ACTUEL.md).
 *
 * V4 délègue à `computeRealEstatePortfolio` (lib/real-estate/portfolio.ts,
 * source unique depuis V3.1 multi-crédit). On charge ici uniquement les
 * méta UI non extractibles depuis `PropertySimResult` (libellé, adresse,
 * date d'acquisition, taux + durée du crédit principal pour la projection
 * FIRE, flag charges_are_estimated). Le mapping vers le type `BienImmo` se
 * fait via le helper pur `buildBienImmoFromSimulation`.
 *
 * Mode strict charges (validé V4) : pas de fallback `getDefaultCharges` —
 * un bien sans `property_charges` aura un cashflow surévalué côté /analyse
 * ET côté fiche détail (même chiffre), le flag `charges_are_estimated`
 * reste pour l'affichage. La résolution des charges manquantes sera
 * traitée de façon centralisée dans une vague Charges ultérieure.
 */
async function loadImmo(userId: string): Promise<ImmoLoadResult> {
  const supabase = await createServerClient()

  // ── Méta UI : props (sans purchase_price ni works_amount — ces valeurs
  //    transitent désormais par le moteur via PropertySimResult). ──────
  const { data: props } = await supabase
    .from('real_estate_properties')
    .select(`
      id, asset_id, address_city, address_country, fiscal_regime,
      asset:assets!asset_id ( id, name, acquisition_date )
    `)
    .eq('user_id', userId)

  if (!props || props.length === 0) {
    return {
      biens: [], totalImmo: 0, totalDettes: 0, loyersMensuels: 0,
      totalImmoEquity: 0, risqueImmoGlobal: 30, revenuPassifImmo: 0,
      mensualitesImmoTotal: 0, rendementNetImmoMoyen: 0,
    }
  }

  const rows     = props as unknown as ImmoRowMeta[]
  const assetIds = rows.map((r) => r.asset_id).filter(Boolean)
  const propIds  = rows.map((r) => r.id)

  // ── Crédit principal (taux + durée + start_date) — pour la projection
  //    FIRE qui a besoin d'extrapoler les intérêts par bien. Filtre
  //    status='active' (BUG-D1-M08) et loan_kind='principal' pour cibler
  //    le prêt principal parmi un multi-crédit. ──────────────────────
  const { data: debtsRaw } = await supabase
    .from('debts')
    .select('asset_id, interest_rate, duration_months, start_date, loan_kind')
    .in('asset_id', assetIds)
    .eq('status', 'active')
  const principalByAsset = new Map<string, {
    rate: number; durMonths: number; startDate: string | null
  }>()
  for (const d of (debtsRaw ?? []) as PrincipalDebtMeta[]) {
    if (!d.asset_id) continue
    if ((d.loan_kind ?? 'principal') !== 'principal') continue
    if (principalByAsset.has(d.asset_id)) continue   // 1er principal rencontré
    principalByAsset.set(d.asset_id, {
      rate:      num(d.interest_rate),
      durMonths: num(d.duration_months),
      startDate: d.start_date,
    })
  }

  // ── Flag charges_are_estimated (existence d'une ligne property_charges
  //    pour le bien). On ne charge PAS les valeurs : c'est le moteur qui
  //    s'en charge via computeRealEstatePortfolio. ──────────────────────
  const { data: chargesPropIds } = await supabase
    .from('property_charges')
    .select('property_id')
    .in('property_id', propIds)
  const propsWithCharges = new Set<string>(
    ((chargesPropIds ?? []) as Array<{ property_id: string }>).map((c) => c.property_id),
  )

  // ── APPEL CENTRAL : computeRealEstatePortfolio = source unique des KPIs.
  //    Charge en interne props/lots/debts (multi-crédit)/charges/profile
  //    puis lance runSimulation pour chaque bien (amortissement, carry-
  //    forward, différé, Pinel, multi-crédit). Garantit la cohérence avec
  //    la fiche détail et la page liste /immobilier. ───────────────────
  const portfolio = await computeRealEstatePortfolio(supabase, userId)
  const portfolioByPropId = new Map(
    portfolio.properties.map((p) => [p.propertyId, p]),
  )

  // ── Mapping props → BienImmo via le helper pur. ──────────────────────
  let totalImmo = 0, totalDettes = 0, loyersMensuels = 0, mensualitesTotal = 0

  const biens: BienImmo[] = []
  for (const r of rows) {
    const sim = portfolioByPropId.get(r.id)
    if (!sim) continue   // bien sans simulation (ne devrait jamais arriver)

    const asset     = Array.isArray(r.asset) ? r.asset[0] : r.asset
    const principal = principalByAsset.get(r.asset_id)

    const bien = buildBienImmoFromSimulation(sim, {
      uiType:                   inferTypeUsageFromRegime(r.fiscal_regime),
      city:                     r.address_city,
      country:                  r.address_country,
      fiscal_regime:            r.fiscal_regime,
      acquisitionDate:          asset?.acquisition_date ?? null,
      chargesEstimated:         !propsWithCharges.has(r.id),
      principalRatePct:         principal?.rate      ?? 3.0,   // default 3 % si pas de principal
      principalDurationMonths:  principal?.durMonths ?? 0,
      principalStartDate:       principal?.startDate ?? null,
    })

    // Override `nom` avec asset.name si dispo (le helper retombe sur city sinon)
    if (asset?.name) bien.nom = asset.name

    totalImmo        += bien.valeur
    totalDettes      += bien.credit_restant
    loyersMensuels   += bien.loyer_mensuel
    mensualitesTotal += bien.mensualite_credit
    biens.push(bien)
  }

  return {
    biens,
    totalImmo,
    totalDettes,
    loyersMensuels,
    totalImmoEquity:        totalImmo - totalDettes,
    risqueImmoGlobal:       calculerRisqueImmoGlobal(biens),
    revenuPassifImmo:       calculerRevenuPassifImmo(biens),
    mensualitesImmoTotal:   mensualitesTotal,
    rendementNetImmoMoyen:  rendementNetMoyenPondere(biens),
  }
}

/** Sous-ensemble de `real_estate_properties` chargé par loadImmo (méta UI). */
interface ImmoRowMeta {
  id:                 string
  asset_id:           string
  address_city:       string | null
  address_country:    string | null
  fiscal_regime:      string | null
  asset?: { id: string; name: string | null; acquisition_date: string | null } | null
}

/** Sous-ensemble de `debts` chargé par loadImmo (crédit principal seul). */
interface PrincipalDebtMeta {
  asset_id:           string | null
  interest_rate:      number | string | null
  duration_months:    number | string | null
  start_date:         string | null
  loan_kind:          string | null
}

// ─────────────────────────────────────────────────────────────────
// Cash
// ─────────────────────────────────────────────────────────────────

interface CashRow {
  id:           string
  account_type: string | null
  balance:      number | string | null
  currency:     string | null
  bank_name:    string | null
  asset?: { id: string; name: string | null } | null
}

const CASH_LABEL: Record<string, string> = {
  livret_a:      'Livret A',
  ldds:          'LDDS',
  lep:           'LEP',
  pel:           'PEL',
  cel:           'CEL',
  compte_courant: 'Compte courant',
  autre:         'Autre',
}

async function loadCash(userId: string): Promise<{ comptes: CompteCash[]; totalCash: number }> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('cash_accounts')
    .select('id, account_type, balance, currency, bank_name, asset:assets!asset_id (id, name)')
    .eq('user_id', userId)

  if (!data || data.length === 0) return { comptes: [], totalCash: 0 }

  let totalCash = 0
  const comptes: CompteCash[] = await Promise.all((data as unknown as CashRow[]).map(async (r) => {
    const asset = Array.isArray(r.asset) ? r.asset[0] : r.asset
    const local = num(r.balance)
    const devise = (r.currency ?? 'EUR').toUpperCase()
    const eur = await toEur(local, devise as CurrencyCode).catch(() => local)
    totalCash += eur
    return {
      id:     r.id,
      nom:    asset?.name ?? CASH_LABEL[(r.account_type ?? '').toLowerCase()] ?? 'Compte',
      type:   (r.account_type ?? 'autre').toLowerCase(),
      banque: r.bank_name ?? null,
      solde:  eur,
      devise,
    }
  }))

  return { comptes, totalCash }
}

// ─────────────────────────────────────────────────────────────────
// Profil
// ─────────────────────────────────────────────────────────────────

interface ProfileRow {
  prenom: string | null
  age: number | null
  age_cible: number | null
  epargne_mensuelle: number | null
  revenu_passif_cible: number | null
  revenu_mensuel: number | null; revenu_conjoint: number | null; autres_revenus: number | null
  loyer: number | null; autres_credits: number | null
  charges_fixes: number | null; depenses_courantes: number | null
  enveloppes: string[] | null
  tmi_rate: number | null
  risk_1: string | null; risk_2: string | null; risk_3: string | null; risk_4: string | null
  quiz_bourse: number[] | null; quiz_crypto: number[] | null; quiz_immo: number[] | null
  // Champs profil exploites par les scores et recos (Tache A) — voir
  // lib/profil/calculs.ts pour les normalizers et lib/analyse/scores.ts +
  // lib/analyse/recommandations.ts pour les regles qui les consomment.
  situation_familiale: string | null
  enfants:             string | null
  fire_type:           string | null
  priorite:            string | null
  stabilite_revenus:   string | null
  // QW2 — statut_pro sert de fallback pour deriver la stabilite quand
  // stabilite_revenus est null (etape 2 skippee).
  statut_pro:          string | null
}

interface ProfileLoaded {
  prenom:               string | null
  profilType:           string | null
  age:                  number | null
  age_cible:            number | null
  epargne_mensuelle:    number
  /** Cible saisie BRUTE par l'utilisateur dans le wizard. Source des sliders /
   *  saisies. À NE PAS utiliser pour les calculs FIRE aval — passer par
   *  `revenu_passif_cible_ajuste`. */
  revenu_passif_cible:  number
  /** Cible AJUSTÉE à la composition du foyer (= brut + adjustCibleFamille).
   *  Reflète enfants (+300 €/mois/enfant) + couple marié/PACS sans revenu
   *  conjoint (+50 % de la cible). Source unique pour tout calcul FIRE
   *  (capital cible, âge FIRE, score Progression FIRE, recos). QW9. */
  revenu_passif_cible_ajuste: number
  /** QW9-bis — Décomposition explicable (raisons, deltas par cause).
   *  Source unique pour les composants UI <CibleFoyer> sur Hero / score /
   *  ProfilCard / slider, ainsi que pour les helpers texte (email, ARIA). */
  cibleFoyerDetail: import('@/lib/profil/cibleFamille').CibleFoyerDetail
  /** QW9-bis — Exposé pour le slider live de /analyse (recompute du delta
   *  couple). Pas utilisé pour le scoring (somme déjà dans revenu_mensuel_total). */
  revenu_conjoint:  number
  revenu_mensuel_total: number    // vous + conjoint + autres
  charges_mensuelles:   number
  risk_score:           number
  enveloppes:           string[]
  tmi_rate:             number | null
  // Cibles des helpers de la lib profil (normalises a la consommation,
  // pas ici — on garde les libelles bruts pour traçabilite).
  situation_familiale:  string | null
  enfants:              string | null
  fire_type:            string | null
  priorite:             string | null
  stabilite_revenus:    string | null
}

async function loadProfile(userId: string): Promise<ProfileLoaded> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select(`
      prenom, age, age_cible, epargne_mensuelle, revenu_passif_cible,
      revenu_mensuel, revenu_conjoint, autres_revenus,
      loyer, autres_credits, charges_fixes, depenses_courantes,
      enveloppes, tmi_rate,
      risk_1, risk_2, risk_3, risk_4,
      quiz_bourse, quiz_crypto, quiz_immo,
      situation_familiale, enfants, fire_type, priorite, stabilite_revenus,
      statut_pro
    `)
    .eq('id', userId)
    .maybeSingle()
  if (!data) {
    // QW9-bis — Detail neutre (pas d'ajustement) pour profil absent.
    // Import statique : pas de cycle (cibleFamille ne dépend pas de aggregateur).
    const { adjustCibleFamilleDetail: _detailEmpty } = await import('@/lib/profil/cibleFamille')
    return {
      prenom: null, profilType: null,
      age: null, age_cible: null,
      epargne_mensuelle: 0,
      revenu_passif_cible: 0,
      revenu_passif_cible_ajuste: 0,
      cibleFoyerDetail: _detailEmpty({}),
      revenu_conjoint: 0,
      revenu_mensuel_total: 0,
      charges_mensuelles: 0, risk_score: 50, enveloppes: [], tmi_rate: null,
      situation_familiale: null, enfants: null, fire_type: null,
      priorite: null, stabilite_revenus: null,
    }
  }
  const p = data as unknown as ProfileRow

  // Réutilise la lib du module Profil (déjà testée). Import dynamique pour
  // éviter une circularité au boot.
  const {
    riskScore, experienceScore, inferProfileType,
    normalizeStabiliteRevenus, deriveStabiliteFromStatutPro,
  } = await import('@/lib/profil/calculs')
  const risk = riskScore({ risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4 })
  const exp  = experienceScore({
    bourse: { correct: countCorrect(p.quiz_bourse), total: 4 },
    crypto: { correct: countCorrect(p.quiz_crypto), total: 4 },
    immo:   { correct: countCorrect(p.quiz_immo),   total: 3 },
  })
  const charges       = num(p.loyer) + num(p.autres_credits) + num(p.charges_fixes) + num(p.depenses_courantes)
  const revenuMensuel = num(p.revenu_mensuel) + num(p.revenu_conjoint) + num(p.autres_revenus)

  // QW9 + QW9-bis — Cible FIRE ajustée à la composition du foyer.
  // Brut = ce que l'utilisateur a saisi (Step8 wizard). Ajusté = brut +
  // adjustCibleFamille (cf. lib/profil/calculs.ts) qui ajoute +300 €/mois
  // par enfant à charge + 50 % de la cible si couple marié/PACS sans revenu
  // conjoint déclaré. Pas de double-comptage avec revenu_mensuel_total : le
  // delta couple ne s'applique QUE si revenu_conjoint == 0.
  // La valeur ajustée est la source unique pour TOUS les calculs FIRE aval.
  // QW9-bis : on calcule aussi le `detail` explicable (raisons par cause),
  // exposé dans fireInputs pour les composants <CibleFoyer> en aval.
  const cibleBrute = num(p.revenu_passif_cible)
  const revenuConjoint = num(p.revenu_conjoint)
  const { adjustCibleFamilleDetail } = await import('@/lib/profil/cibleFamille')
  const cibleFoyerDetail = adjustCibleFamilleDetail({
    enfants:             p.enfants,
    situation_familiale: p.situation_familiale,
    revenu_conjoint:     revenuConjoint,
    revenu_passif_cible: cibleBrute,
  })
  // Garantie strictement legacy : ajuste = brut + adjustCibleFamille(p).
  // (Identité testée dans cibleFamille.test.ts.)
  const cibleAjustee = cibleFoyerDetail.ajuste

  // QW2 — Stabilité EFFECTIVE : saisie explicite (étape 2, skippable) ou,
  // à défaut, fallback dérivé du statut_pro (étape 1, obligatoire).
  // N'écrase jamais une saisie : `??` ne s'applique que si la normalisation
  // du brut donne null (= non renseigné / non reconnu). On expose l'ID
  // normalisé (ou null) — le consommateur calculerSolidite re-normalise
  // (idempotent sur les IDs).
  const stabiliteEffective =
    normalizeStabiliteRevenus(p.stabilite_revenus)
      ?? deriveStabiliteFromStatutPro(p.statut_pro)

  return {
    prenom:              p.prenom,
    profilType:          inferProfileType(risk, exp),
    age:                 p.age,
    age_cible:           p.age_cible,
    epargne_mensuelle:   num(p.epargne_mensuelle),
    revenu_passif_cible:        cibleBrute,
    revenu_passif_cible_ajuste: cibleAjustee,
    cibleFoyerDetail:           cibleFoyerDetail,
    revenu_conjoint:            revenuConjoint,
    revenu_mensuel_total: revenuMensuel,
    charges_mensuelles:  charges,
    risk_score:          risk,
    enveloppes:          p.enveloppes ?? [],
    tmi_rate:            p.tmi_rate,
    situation_familiale: p.situation_familiale,
    enfants:             p.enfants,
    fire_type:           p.fire_type,
    priorite:            p.priorite,
    // QW2 — valeur EFFECTIVE (saisie ou fallback statut_pro), pas le brut.
    stabilite_revenus:   stabiliteEffective,
  }
}

function countCorrect(answers: number[] | null): number {
  // Proxy : nombre de réponses fournies (non -1). La valeur officielle de
  // niveau de quiz est dans /profil ; ici on n'a besoin que d'un score
  // approximatif pour inférer le profilType (Conservateur/Équilibré/…).
  if (!answers || answers.length === 0) return 0
  return answers.filter((a) => typeof a === 'number' && a >= 0).length
}

// ─────────────────────────────────────────────────────────────────
// Répartition par classes (Actions / ETF / Crypto / Immo / Cash / …)
// ─────────────────────────────────────────────────────────────────

function repartitionClasses(positions: EnrichedPosition[], totalImmo: number, totalCash: number, total: number): ClasseAlloc[] {
  const buckets = new Map<string, number>()
  const ASSET_TO_LABEL: Record<AnalyseAssetType, string> = {
    stock:   'Actions',
    etf:     'ETF / Fonds',
    crypto:  'Crypto',
    bond:    'Obligataire',
    scpi:    'Immobilier',   // SCPI / OPCI / REIT en positions → bucket Immobilier
    metal:   'Métaux',       // or, argent, platine, palladium
    unknown: 'Cash',         // sous-catégorisé pour éviter une bucket fantôme
  }
  for (const p of positions) {
    const lbl = ASSET_TO_LABEL[p.asset_type] ?? 'Cash'
    buckets.set(lbl, (buckets.get(lbl) ?? 0) + p.current_value)
  }
  if (totalImmo > 0) buckets.set('Immobilier', (buckets.get('Immobilier') ?? 0) + totalImmo)
  if (totalCash > 0) buckets.set('Cash',       (buckets.get('Cash')       ?? 0) + totalCash)

  return Array.from(buckets.entries())
    .map(([label, valeur]) => ({
      label, valeur,
      pourcentage: total > 0 ? (valeur / total) * 100 : 0,
      color: CLASSE_COLOR[label] ?? '#71717a',
    }))
    .sort((a, b) => b.valeur - a.valeur)
}

// ─────────────────────────────────────────────────────────────────
// Répartition sectorielle / géographique — version Phase 5
// (utilise lib/analyse/expandETF pour décomposer les ETFs ; cash et
// immo physique exclus)
// ─────────────────────────────────────────────────────────────────

// Anciens seuils absolus (legacy, non utilisés depuis la refonte benchmark).
// La surexposition est désormais évaluée vs MSCI ACWI/World — cf. benchmarks.ts.

/**
 * Debug : trace dans les logs serveur le détail de l'expansion. Aide à
 * diagnostiquer pourquoi un ETF n'est pas décomposé (ISIN absent de la
 * table, asset_type incorrect, ISIN avec espaces/casse différente, etc.).
 *
 * À garder activé en prod : volume modéré (1 ligne par position) et
 * ces logs sont la 1ère chose qu'on consulte quand un user remonte un
 * bug "secteurs vides".
 */
function logExpansionDebug(positions: EnrichedPosition[], exp: ExpansionResult) {
  devLog(`[expandETF] ────── début expansion (${positions.length} positions, total ${exp.totalValue.toFixed(0)}€) ──────`)

  for (const p of positions) {
    const compo = p.isin ? getEtfComposition(p.isin) : null
    const isInTable = compo !== null
    devLog(
      `[expandETF] ${p.isin || '(no ISIN)'}` +
      ` ${p.name.padEnd(30).slice(0, 30)}` +
      ` type=${p.asset_type.padEnd(7)}` +
      ` value=${p.current_value.toFixed(0).padStart(7)}€` +
      ` mappe=${isInTable ? 'OUI' : 'non'}`,
    )
    if (compo) {
      const decomp = Object.entries(compo.sectors)
        .sort(([, a], [, b]) => b - a)
        .map(([s, pct]) => `${s}:${(p.current_value * pct / 100).toFixed(0)}€`)
        .join(', ')
      devLog(`[expandETF]    → ${compo.name} décomposé en ${decomp}`)
    }
  }

  devLog(`[expandETF] identifié=${exp.identifiedValue.toFixed(0)}€ / ${exp.totalValue.toFixed(0)}€ (${exp.totalValue > 0 ? Math.round(exp.identifiedValue / exp.totalValue * 100) : 0}%)`)
  devLog(`[expandETF] ────── fin expansion ──────`)
}

/**
 * Construit les allocations sectorielle + géographique à partir des
 * positions du PORTEFEUILLE FINANCIER UNIQUEMENT.
 *
 * Cash et immobilier physique sont EXCLUS volontairement (classes
 * d'actif distinctes affichées dans leurs sections dédiées). Inclure
 * l'immo polluerait les graphiques (un patrimoine 80 % immo afficherait
 * "Immobilier 80 %" et écraserait toute analyse des secteurs).
 */
function buildAllocations(positions: EnrichedPosition[]): {
  secteur: SecteurAlloc[]
  geo:     GeoAlloc[]
  fiabilite: AnalyseFiabilite
  unmappedEtfs: Array<{ isin: string; name: string; value: number }>
  unmappedAll:  Array<{ isin: string; name: string; value: number; reason: string }>
  cryptoTotal:     number
  cryptoCostTotal: number
  cryptoBreakdown: PatrimoineComplet['cryptoBreakdown']
} {
  const exp = expandPositions(positions)
  logExpansionDebug(positions, exp)

  // Buckets sectoriels avec déviation vs MSCI World
  const secB = bucketsBySector(exp.sectorExposures, exp.totalValue, { excludeUnmapped: true })
  const secteur: SecteurAlloc[] = secB.map((b) => {
    const benchmark = benchmarkSectorOf(b.secteur)
    const { deviation, status } = classifyDeviation(b.pct, benchmark, 'sector')
    return {
      secteur:     b.secteur,
      valeur:      b.value,
      pourcentage: b.pct,
      benchmark, deviation, status,
      positions:   b.sources,
      alerte:      status === 'overweight' || status === 'overweight_strong',
    }
  })

  // Buckets géo avec déviation vs MSCI ACWI
  const geoB = bucketsByZone(exp.geoExposures, exp.totalValue, { excludeUnmapped: true })
  const geo: GeoAlloc[] = geoB.map((b) => {
    const benchmark = benchmarkGeoOf(b.zone)
    const { deviation, status } = classifyDeviation(b.pct, benchmark, 'geo')
    return {
      zone:        b.zone,
      valeur:      b.value,
      pourcentage: b.pct,
      benchmark, deviation, status,
      pays:        b.pays,
      alerte:      status === 'overweight' || status === 'overweight_strong',
    }
  })

  // Fiabilité de l'analyse
  const pct = exp.totalValue > 0 ? Math.round((exp.identifiedValue / exp.totalValue) * 100) : 0
  const fiabilite: AnalyseFiabilite =
    pct >= 90 ? { pct, niveau: 'vert',   label: 'Analyse fiable' } :
    pct >= 70 ? { pct, niveau: 'orange', label: 'Analyse partiellement fiable' } :
                { pct, niveau: 'rouge',  label: 'Données insuffisantes — certains actifs non identifiés' }

  // Crypto breakdown : fusion des doublons (Bitcoin acheté en 3 fois →
  // 1 seule ligne avec PRU pondéré + quantité cumulée) puis tri par valeur.
  const cryptoMerged = new Map<string, {
    isin: string; name: string; value: number; pru: number; quantity: number; cost: number
  }>()
  for (const c of exp.cryptoPositions) {
    // Clé de fusion : symbole / nom normalisé (BTC = BTC quel que soit le wallet/exchange)
    const key = (c.isin || c.name).trim().toUpperCase()
    const ex = cryptoMerged.get(key)
    if (ex) {
      // Moyenne pondérée du PRU par les quantités
      const totalQty = ex.quantity + c.quantity
      ex.pru = totalQty > 0 ? ((ex.pru * ex.quantity) + (c.pru * c.quantity)) / totalQty : 0
      ex.quantity = totalQty
      ex.value   += c.value
      ex.cost     = ex.pru * ex.quantity
    } else {
      cryptoMerged.set(key, {
        isin: c.isin, name: c.name, value: c.value,
        pru: c.pru, quantity: c.quantity, cost: c.pru * c.quantity,
      })
    }
  }
  const cryptoCostTotal = Array.from(cryptoMerged.values()).reduce((s, c) => s + c.cost, 0)
  const cryptoBreakdown = Array.from(cryptoMerged.values())
    .map((c) => ({
      ...c,
      pct: exp.cryptoTotal > 0 ? (c.value / exp.cryptoTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    secteur, geo, fiabilite,
    unmappedEtfs: exp.unmappedEtfs,
    unmappedAll:  exp.unmappedAll,
    cryptoTotal:     exp.cryptoTotal,
    cryptoCostTotal,
    cryptoBreakdown,
  }
}

// ─────────────────────────────────────────────────────────────────
// Rendement estimé + revenu passif
// ─────────────────────────────────────────────────────────────────

/**
 * Rendement annuel estimé : moyenne pondérée par valeur de marché.
 *   - Immobilier : rendement brut (loyers × 12 / valeur)
 *   - Cash : 0 % (pessimiste, sauf à brancher les taux de rémunération)
 *   - Portefeuille : 5 % default (proxy long-terme actions/ETF), 0 % crypto
 *
 * C'est volontairement grossier : le but est de donner un ordre de grandeur,
 * pas un calcul TWR. Une vraie version branchera les dividendes via Yahoo
 * (yieldRate) plus tard.
 */
function rendementEstime(
  positions: EnrichedPosition[],
  biens:     BienImmo[],
  totalCash: number,
  total:     number,
): number {
  if (total <= 0) return 0

  let weightedReturn = 0
  for (const b of biens) {
    // Immo direct : on garde le rendement_brut réel par bien (loyers / valeur)
    // car il dépend des inputs utilisateur. Fallback constante immo si NaN.
    const r = Number.isFinite(b.rendement_brut) ? b.rendement_brut : RENDEMENT_PAR_CLASSE.immo * 100
    weightedReturn += (b.valeur / total) * r
  }
  // Cash : taux centralisé (I10 — avant 1 % en dur ici, 3 % ailleurs)
  weightedReturn += (totalCash / total) * (RENDEMENT_PAR_CLASSE.cash * 100)
  // Portefeuille : par classe (crypto via constante dédiée, fallback actions)
  for (const p of positions) {
    const cls =
      p.asset_type === 'crypto' ? 'crypto' :
      p.asset_type === 'bond'   ? 'obligataire' :
      p.asset_type === 'scpi'   ? 'scpi' :
      p.asset_type === 'metal'  ? 'metaux' :
      'actions'
    const r = (RENDEMENT_PAR_CLASSE as Record<string, number>)[cls]
      ?? RENDEMENT_PAR_CLASSE.actions
    weightedReturn += (p.current_value / total) * (r * 100)
  }
  return Math.round(weightedReturn * 100) / 100
}

// ─────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────

export async function getPatrimoineComplet(userId: string): Promise<PatrimoineComplet> {
  const t0 = Date.now()
  const [
    { positions, totalValue: totalPortefeuille },
    immoData,
    { comptes, totalCash },
    profile,
  ] = await Promise.all([
    getEnrichedPositions(userId),
    loadImmo(userId),
    loadCash(userId),
    loadProfile(userId),
  ])
  const {
    biens, totalImmo, totalDettes,
    totalImmoEquity, risqueImmoGlobal, revenuPassifImmo,
    mensualitesImmoTotal, rendementNetImmoMoyen,
  } = immoData
  const { prenom, profilType } = profile

  const totalBrut = totalPortefeuille + totalImmo + totalCash
  const totalNet  = totalBrut - totalDettes

  const repClasses = repartitionClasses(positions, totalImmo, totalCash, totalBrut)
  // Phase 5 : sectoriel + géo SEULEMENT sur le portefeuille financier
  // (cash + immo physique exclus — classes d'actif distinctes)
  const allocs = buildAllocations(positions)
  const repSecteur = allocs.secteur
  const repGeo     = allocs.geo

  const rendement      = rendementEstime(positions, biens, totalCash, totalBrut)
  // Revenu passif TOTAL : cashflow net immo (peut être négatif si bien en
  // levier fort en début de remboursement) + estimation dividendes (2 %
  // du portfolio hors crypto, proxy moyen du dividend yield européen).
  const dividendesProxy = positions.filter((p) => p.asset_type !== 'crypto')
    .reduce((s, p) => s + p.current_value, 0) * 0.02 / 12
  const revenuPassif    = revenuPassifImmo + dividendesProxy

  // Phase 3 — fireInputs : ce dont les composants client ont besoin pour
  // les sliders + ce que les scores/recos consomment.
  const actionsEuValue = positions
    .filter((p) => (p.asset_type === 'stock' || p.asset_type === 'etf')
      && p.country
      && geoZone(p.country) === 'Europe')
    .reduce((s, p) => s + p.current_value, 0)

  // Les 5 champs profil ci-dessous (stabilite_revenus, priorite, fire_type,
  // situation_familiale, enfants) ne sont pas dans le type PatrimoineComplet
  // ['fireInputs'] de types/analyse.ts. Ils sont consommes via cast par
  // lib/analyse/scores.ts (Solidite +5/-15 selon stabilite) et
  // lib/analyse/recommandations.ts (re-tri selon priorite de vie). Champs
  // optionnels : si absents le comportement reste celui pre-Tache A.
  const fireInputs = {
    age:                  profile.age,
    age_cible:            profile.age_cible,
    epargne_mensuelle:    profile.epargne_mensuelle,
    // QW9 — Brut conservé pour saisie/édition (slider ProjectionFIRE),
    // ajusté pour TOUS les calculs FIRE aval (capital, âge, scores, recos).
    revenu_passif_cible:        profile.revenu_passif_cible,
    revenu_passif_cible_ajuste: profile.revenu_passif_cible_ajuste,
    // QW9-bis — Detail explicable + revenu_conjoint pour les composants UI
    // et le recompute live du slider.
    cibleFoyerDetail:           profile.cibleFoyerDetail,
    revenu_conjoint:            profile.revenu_conjoint,
    revenu_mensuel_total: profile.revenu_mensuel_total,
    charges_mensuelles:   profile.charges_mensuelles,
    risk_score:           profile.risk_score,
    enveloppes:           profile.enveloppes,
    tmi_rate:             profile.tmi_rate,
    tmi_estime:           profile.tmi_rate === null,
    actions_eu_value:     actionsEuValue,
    stabilite_revenus:    profile.stabilite_revenus,
    priorite:             profile.priorite,
    fire_type:            profile.fire_type,
    situation_familiale:  profile.situation_familiale,
    enfants:              profile.enfants,
  }

  // Construction temporaire pour calculer scores + recos (besoin de l'objet
  // PatrimoineComplet partiellement rempli sans les scores eux-mêmes).
  const partial: PatrimoineComplet = {
    totalBrut, totalNet,
    totalPortefeuille, totalImmo, totalCash, totalDettes,
    totalImmoEquity, risqueImmoGlobal, revenuPassifImmo,
    mensualitesImmoTotal, rendementNetImmoMoyen,
    positions, biens, comptes,
    repartitionClasses:     repClasses,
    repartitionSectorielle: repSecteur,
    repartitionGeo:         repGeo,
    // Scores de diversification = 100 − tracking error vs benchmark mondial
    // (MSCI ACWI / MSCI World). Un portefeuille aligné sur le marché = 100.
    scoreDiversificationSectorielle: trackingErrorScore(
      repSecteur.map((s) => ({ label: s.secteur, pct: s.pourcentage })),
      BENCHMARK_SECTOR_MSCI_WORLD,
    ),
    scoreDiversificationGeo: trackingErrorScore(
      repGeo.map((g) => ({ label: g.zone, pct: g.pourcentage })),
      BENCHMARK_GEO_MSCI_ACWI,
    ),
    rendementEstime:        rendement,
    revenuPassifActuel:     revenuPassif,
    projectionFIRESnapshot: computeProjectionSnapshot({
      ageActuel:             profile.age,
      ageCible:              profile.age_cible,
      // QW9 — Cible AJUSTÉE composition foyer (cf. loadProfile pour la dérivation).
      revenuPassifCible:     profile.revenu_passif_cible_ajuste,
      epargneMensuelle:      profile.epargne_mensuelle,
      rendementCentral:      Math.max(3, Math.min(12,
        calculerRendementPortefeuille({
          positions, totalImmo, totalCash,
        } as unknown as PatrimoineComplet) || 7,
      )),
      patrimoineFinancier:   totalPortefeuille,
      cashActuel:            totalCash,
      biens,
      totalNet,
      fireType:              profile.fire_type,
      inflationPct:          INFLATION_DEFAUT_PCT,
    }),
    profilType,
    prenom,
    fireInputs,
    scores:                 {} as PatrimoineComplet['scores'],
    recommandations:        [],
    analyseFiabilite:       allocs.fiabilite,
    unmappedEtfs:           allocs.unmappedEtfs,
    unmappedAll:            allocs.unmappedAll,
    cryptoTotal:            allocs.cryptoTotal,
    cryptoCostTotal:        allocs.cryptoCostTotal,
    cryptoBreakdown:        allocs.cryptoBreakdown,
    lastUpdated:            new Date().toISOString(),
  }
  const scores          = calculerTousLesScores(partial)
  const recommandations = genererRecommandations({ ...partial, scores }, scores)

  devLog(`[aggregateur] patrimoine complet en ${Date.now() - t0}ms — ${positions.length} pos, ${biens.length} biens, ${comptes.length} comptes, fiabilité ${allocs.fiabilite.pct}%, ${recommandations.length} reco(s)`)
  // Log breakdown patrimoine net (utile pour debug discordance UI)
  devLog(`[aggregateur] patrimoine = financier ${totalPortefeuille.toFixed(0)}€ + immo brut ${totalImmo.toFixed(0)}€ + cash ${totalCash.toFixed(0)}€ = brut ${totalBrut.toFixed(0)}€ — dettes ${totalDettes.toFixed(0)}€ = NET ${totalNet.toFixed(0)}€ (equity immo ${totalImmoEquity.toFixed(0)}€)`)
  if (allocs.unmappedEtfs.length > 0) {
    devWarn(`[aggregateur] ⚠ ${allocs.unmappedEtfs.length} ETF non mappé(s) — secteurs estimés uniquement :`)
    for (const u of allocs.unmappedEtfs) {
      devWarn(`  ${u.isin}  ${u.name}  (${u.value.toFixed(0)}€)`)
    }
    devWarn('  → Ces ISIN à ajouter dans lib/analyse/etfCompositions.ts')
  }

  return { ...partial, scores, recommandations }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — projection FIRE snapshot (Sprint 1)
// ─────────────────────────────────────────────────────────────────────

interface ProjectionSnapshotInputs {
  ageActuel:           number | null
  ageCible:            number | null
  revenuPassifCible:   number       // €/mois
  epargneMensuelle:    number       // €/mois
  rendementCentral:    number       // %
  patrimoineFinancier: number
  cashActuel:          number
  biens:               BienImmo[]
  totalNet:            number
  fireType:            string | null
  inflationPct:        number       // %, aligne sur projection /analyse
}

/**
 * Calcule un snapshot de projection FIRE pour le Dashboard Hero.
 * Retourne null si les inputs profil sont incomplets.
 *
 * Détermine aussi l'épargne mensuelle qui permettrait d'atteindre la cible
 * à l'âge cible déclaré (bissection sur l'épargne mensuelle de l'utilisateur).
 */
function computeProjectionSnapshot(i: ProjectionSnapshotInputs): import('@/types/analyse').ProjectionFIRESnapshot | null {
  if (i.ageActuel === null || i.ageCible === null || i.revenuPassifCible <= 0) return null
  if (i.ageCible <= i.ageActuel) return null

  // SWR aligne sur le fire_type du profil (lean=3.5, fat=3, standard=4).
  // C'est le meme helper que /analyse > ProjectionFIRE.tsx, donc Hero et
  // page Analyse affichent desormais la meme cible et le meme pourcentage.
  const swrPct = swrPctFromFireType(i.fireType)

  const baseInputs = {
    ageActuel:                 i.ageActuel,
    ageCible:                  i.ageCible,
    revenuPassifCible:         i.revenuPassifCible,
    epargneMensuelle:          i.epargneMensuelle,
    rendementCentral:          i.rendementCentral,
    appreciationImmoPct:       2,
    inflationLoyersPct:        1.5,
    inflationPct:              i.inflationPct,
    swrPct,
    patrimoineFinancierActuel: i.patrimoineFinancier,
    cashActuel:                i.cashActuel,
    biensExistants:            i.biens,
    acquisitionsFutures:       [],
  }

  const interval = projectionFIREIntervalle(baseInputs)

  // Cible FIRE = revenu annuel cible / SWR, indexee sur l'inflation a
  // l'horizon de l'age cible. Formule unique via lib/analyse/constants.ts
  // (I9 — audit fix : 3 implémentations divergentes consolidées).
  const yearsToTarget = Math.max(0, i.ageCible - i.ageActuel)
  const patrimoineFireCible = calculerCiblePatrimoine(
    i.revenuPassifCible, yearsToTarget, i.inflationPct, swrPct,
  )

  // Si déjà sur la trajectoire (atteint la cible avant l'âge cible)
  // → pas de besoin d'épargne supplémentaire.
  const onTime = interval.age_fire_median !== null
              && interval.age_fire_median <= i.ageCible
  let epargneNecessaire: number | null = null
  if (!onTime) {
    let lo = i.epargneMensuelle
    let hi = Math.max(20_000, i.epargneMensuelle * 10 + 5_000)
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) / 2
      const r = projectionGlobale({ ...baseInputs, epargneMensuelle: mid })
      const reaches = r.ageIndependanceCentral !== null
                   && r.ageIndependanceCentral <= i.ageCible
      if (reaches) hi = mid
      else         lo = mid
    }
    epargneNecessaire = Math.round(hi)
    const check = projectionGlobale({ ...baseInputs, epargneMensuelle: epargneNecessaire })
    if (check.ageIndependanceCentral === null
     || check.ageIndependanceCentral > i.ageCible) {
      epargneNecessaire = null
    }
  }

  return {
    age_fire_projete:             interval.age_fire_median,
    age_fire_optimiste:           interval.age_fire_optimiste,
    age_fire_median:              interval.age_fire_median,
    age_fire_pessimiste:          interval.age_fire_pessimiste,
    rendement_central_pct:        interval.rendement_central_pct,
    patrimoine_age_cible:         interval.patrimoine_age_cible_median,
    patrimoine_fire_cible:        Math.round(patrimoineFireCible),
    epargne_mensuelle_necessaire: epargneNecessaire,
  }
}
