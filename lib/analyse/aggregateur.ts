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
import { diversificationScore } from './diversification'
import { geoZone } from './geoMapping'
import { calculerTousLesScores } from './scores'
import { genererRecommandations } from './recommandations'
import { expandPositions, bucketsBySector, bucketsByZone } from './expandETF'
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
// ─────────────────────────────────────────────────────────────────

interface ImmoRow {
  id:                 string
  asset_id:           string
  address_city:       string | null
  address_country:    string | null
  purchase_price:     number | string | null
  works_amount:       number | string | null
  fiscal_regime:      string | null
  assumed_total_rent: number | string | null
  asset?: { id: string; name: string | null; status: string | null } | null
}

interface DebtRow {
  asset_id:           string | null
  capital_remaining:  number | string | null
}

interface LotRow {
  property_id: string
  rent_amount: number | string | null
}

const FISCAL_TO_TYPE: Record<string, string> = {
  rp:           'Résidence principale',
  primary:      'Résidence principale',
  rental:       'Locatif',
  lmnp:         'Locatif (LMNP)',
  lmp:          'Locatif (LMP)',
  nue:          'Locatif nu',
  scpi:         'SCPI',
}

async function loadImmo(userId: string): Promise<{ biens: BienImmo[]; totalImmo: number; totalDettes: number; loyersMensuels: number }> {
  const supabase = await createServerClient()

  const { data: props } = await supabase
    .from('real_estate_properties')
    .select(`
      id, asset_id, address_city, address_country, purchase_price,
      works_amount, fiscal_regime, assumed_total_rent,
      asset:assets!asset_id ( id, name, status )
    `)
    .eq('user_id', userId)

  if (!props || props.length === 0) {
    return { biens: [], totalImmo: 0, totalDettes: 0, loyersMensuels: 0 }
  }

  const rows = props as unknown as ImmoRow[]
  const assetIds = rows.map((r) => r.asset_id).filter(Boolean)

  // Loyers : somme des rent_amount des lots actifs par property
  const { data: lotsRaw } = await supabase
    .from('real_estate_lots')
    .select('property_id, rent_amount, status')
    .in('property_id', rows.map((r) => r.id))
  const lots = (lotsRaw ?? []) as Array<LotRow & { status: string | null }>
  const rentByProperty = new Map<string, number>()
  for (const l of lots) {
    if (l.status === 'rented' || !l.status) {
      rentByProperty.set(l.property_id, (rentByProperty.get(l.property_id) ?? 0) + num(l.rent_amount))
    }
  }

  // Dettes : capital_remaining par asset_id
  const { data: debtsRaw } = await supabase
    .from('debts')
    .select('asset_id, capital_remaining')
    .in('asset_id', assetIds)
  const debtByAsset = new Map<string, number>()
  for (const d of (debtsRaw ?? []) as DebtRow[]) {
    if (d.asset_id) {
      debtByAsset.set(d.asset_id, (debtByAsset.get(d.asset_id) ?? 0) + num(d.capital_remaining))
    }
  }

  let totalImmo = 0, totalDettes = 0, loyersMensuels = 0
  const biens: BienImmo[] = rows.map((r) => {
    const asset = Array.isArray(r.asset) ? r.asset[0] : r.asset
    const valeur = num(r.purchase_price) + num(r.works_amount)
    const creditRestant = debtByAsset.get(r.asset_id) ?? 0
    // Loyer mensuel : priorité aux lots (réel), fallback assumed_total_rent (simulation)
    const loyerLots = rentByProperty.get(r.id) ?? 0
    const loyerMensuel = loyerLots > 0 ? loyerLots : num(r.assumed_total_rent) / 12
    const rendementBrut = valeur > 0 ? (loyerMensuel * 12 / valeur) * 100 : 0

    totalImmo      += valeur
    totalDettes    += creditRestant
    loyersMensuels += loyerMensuel

    const type = FISCAL_TO_TYPE[(r.fiscal_regime ?? '').toLowerCase()] ?? 'Immobilier'
    return {
      id:             r.id,
      nom:            asset?.name ?? r.address_city ?? 'Bien',
      ville:          r.address_city ?? null,
      pays:           r.address_country ?? null,
      type,
      valeur,
      loyer_mensuel:  loyerMensuel,
      credit_restant: creditRestant,
      equity:         valeur - creditRestant,
      rendement_brut: rendementBrut,
    }
  })

  return { biens, totalImmo, totalDettes, loyersMensuels }
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
  loyer: number | null; autres_credits: number | null
  charges_fixes: number | null; depenses_courantes: number | null
  enveloppes: string[] | null
  tmi_rate: number | null
  risk_1: string | null; risk_2: string | null; risk_3: string | null; risk_4: string | null
  quiz_bourse: number[] | null; quiz_crypto: number[] | null; quiz_immo: number[] | null
}

interface ProfileLoaded {
  prenom:               string | null
  profilType:           string | null
  age:                  number | null
  age_cible:            number | null
  epargne_mensuelle:    number
  revenu_passif_cible:  number
  charges_mensuelles:   number
  risk_score:           number
  enveloppes:           string[]
  tmi_rate:             number | null
}

async function loadProfile(userId: string): Promise<ProfileLoaded> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select(`
      prenom, age, age_cible, epargne_mensuelle, revenu_passif_cible,
      loyer, autres_credits, charges_fixes, depenses_courantes,
      enveloppes, tmi_rate,
      risk_1, risk_2, risk_3, risk_4,
      quiz_bourse, quiz_crypto, quiz_immo
    `)
    .eq('id', userId)
    .maybeSingle()
  if (!data) {
    return {
      prenom: null, profilType: null,
      age: null, age_cible: null,
      epargne_mensuelle: 0, revenu_passif_cible: 0,
      charges_mensuelles: 0, risk_score: 50, enveloppes: [], tmi_rate: null,
    }
  }
  const p = data as unknown as ProfileRow

  // Réutilise la lib du module Profil (déjà testée). Import dynamique pour
  // éviter une circularité au boot.
  const { riskScore, experienceScore, inferProfileType } = await import('@/lib/profil/calculs')
  const risk = riskScore({ risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4 })
  const exp  = experienceScore({
    bourse: { correct: countCorrect(p.quiz_bourse), total: 4 },
    crypto: { correct: countCorrect(p.quiz_crypto), total: 4 },
    immo:   { correct: countCorrect(p.quiz_immo),   total: 3 },
  })
  const charges = num(p.loyer) + num(p.autres_credits) + num(p.charges_fixes) + num(p.depenses_courantes)

  return {
    prenom:              p.prenom,
    profilType:          inferProfileType(risk, exp),
    age:                 p.age,
    age_cible:           p.age_cible,
    epargne_mensuelle:   num(p.epargne_mensuelle),
    revenu_passif_cible: num(p.revenu_passif_cible),
    charges_mensuelles:  charges,
    risk_score:          risk,
    enveloppes:          p.enveloppes ?? [],
    tmi_rate:            p.tmi_rate,
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
// Répartition sectorielle / géographique — version Phase 4
// (utilise lib/analyse/expandETF pour décomposer les ETFs)
// ─────────────────────────────────────────────────────────────────

const SECTOR_ALERT_PCT = 30
const GEO_ALERT_PCT    = 50

/**
 * Construit les allocations sectorielle + géographique à partir de
 * l'expansion des positions (ETFs éclatés en sous-jacents). Le cash
 * est exclu — affiché séparément en KPI.
 */
function buildAllocations(positions: EnrichedPosition[], biens: BienImmo[]): {
  secteur: SecteurAlloc[]
  geo:     GeoAlloc[]
  fiabilite: AnalyseFiabilite
  unmappedEtfs: Array<{ isin: string; name: string; value: number }>
} {
  const exp = expandPositions(positions, biens)

  // Buckets sectoriels (excluant "Non mappé" du graphique principal)
  const secB = bucketsBySector(exp.sectorExposures, exp.totalValue, { excludeUnmapped: true })
  const secteur: SecteurAlloc[] = secB.map((b) => ({
    secteur:     b.secteur,
    valeur:      b.value,
    pourcentage: b.pct,
    positions:   b.sources,
    alerte:      b.pct > SECTOR_ALERT_PCT,
  }))

  // Buckets géo (excluant "Non mappé")
  const geoB = bucketsByZone(exp.geoExposures, exp.totalValue, { excludeUnmapped: true })
  const geo: GeoAlloc[] = geoB.map((b) => ({
    zone:        b.zone,
    valeur:      b.value,
    pourcentage: b.pct,
    pays:        b.pays,
    alerte:      b.pct > GEO_ALERT_PCT,
  }))

  // Fiabilité de l'analyse
  const pct = exp.totalValue > 0 ? Math.round((exp.identifiedValue / exp.totalValue) * 100) : 0
  const fiabilite: AnalyseFiabilite =
    pct >= 90 ? { pct, niveau: 'vert',   label: 'Analyse fiable' } :
    pct >= 70 ? { pct, niveau: 'orange', label: 'Analyse partiellement fiable' } :
                { pct, niveau: 'rouge',  label: 'Données insuffisantes — certains actifs non identifiés' }

  return { secteur, geo, fiabilite, unmappedEtfs: exp.unmappedEtfs }
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
    weightedReturn += (b.valeur / total) * b.rendement_brut
  }
  // Cash : 1 % moyen (livret A en 2024-2026)
  weightedReturn += (totalCash / total) * 1.0
  // Portefeuille
  const stockProxy = 5.0
  for (const p of positions) {
    const r = p.asset_type === 'crypto' ? 0 : stockProxy
    weightedReturn += (p.current_value / total) * r
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
    { biens, totalImmo, totalDettes, loyersMensuels },
    { comptes, totalCash },
    profile,
  ] = await Promise.all([
    getEnrichedPositions(userId),
    loadImmo(userId),
    loadCash(userId),
    loadProfile(userId),
  ])
  const { prenom, profilType } = profile

  const totalBrut = totalPortefeuille + totalImmo + totalCash
  const totalNet  = totalBrut - totalDettes

  const repClasses = repartitionClasses(positions, totalImmo, totalCash, totalBrut)
  // Phase 4 : sectoriel + géo via expansion ETF (cash exclu, immo inclus)
  const allocs = buildAllocations(positions, biens)
  const repSecteur = allocs.secteur
  const repGeo     = allocs.geo

  const rendement      = rendementEstime(positions, biens, totalCash, totalBrut)
  // Revenu passif : loyers immobiliers + estimation dividendes (2 % du portfolio
  // hors crypto, proxy moyen du dividend yield européen).
  const dividendesProxy = positions.filter((p) => p.asset_type !== 'crypto')
    .reduce((s, p) => s + p.current_value, 0) * 0.02 / 12
  const revenuPassif    = loyersMensuels + dividendesProxy

  // Phase 3 — fireInputs : ce dont les composants client ont besoin pour
  // les sliders + ce que les scores/recos consomment.
  const actionsEuValue = positions
    .filter((p) => (p.asset_type === 'stock' || p.asset_type === 'etf')
      && p.country
      && geoZone(p.country) === 'Europe')
    .reduce((s, p) => s + p.current_value, 0)

  const fireInputs = {
    age:                 profile.age,
    age_cible:           profile.age_cible,
    epargne_mensuelle:   profile.epargne_mensuelle,
    revenu_passif_cible: profile.revenu_passif_cible,
    charges_mensuelles:  profile.charges_mensuelles,
    risk_score:          profile.risk_score,
    enveloppes:          profile.enveloppes,
    tmi_rate:            profile.tmi_rate,
    actions_eu_value:    actionsEuValue,
  }

  // Construction temporaire pour calculer scores + recos (besoin de l'objet
  // PatrimoineComplet partiellement rempli sans les scores eux-mêmes).
  const partial: PatrimoineComplet = {
    totalBrut, totalNet,
    totalPortefeuille, totalImmo, totalCash, totalDettes,
    positions, biens, comptes,
    repartitionClasses:     repClasses,
    repartitionSectorielle: repSecteur,
    repartitionGeo:         repGeo,
    scoreDiversificationSectorielle: diversificationScore(repSecteur.map((s) => ({ pourcentage: s.pourcentage }))),
    scoreDiversificationGeo:         diversificationScore(repGeo.map((g) => ({ pourcentage: g.pourcentage }))),
    rendementEstime:        rendement,
    revenuPassifActuel:     revenuPassif,
    profilType,
    prenom,
    fireInputs,
    scores:                 {} as PatrimoineComplet['scores'],
    recommandations:        [],
    analyseFiabilite:       allocs.fiabilite,
    unmappedEtfs:           allocs.unmappedEtfs,
    lastUpdated:            new Date().toISOString(),
  }
  const scores          = calculerTousLesScores(partial)
  const recommandations = genererRecommandations({ ...partial, scores }, scores)

  console.log(`[aggregateur] patrimoine complet en ${Date.now() - t0}ms — ${positions.length} pos, ${biens.length} biens, ${comptes.length} comptes, total ${totalBrut.toFixed(0)}€, fiabilité ${allocs.fiabilite.pct}%, ${recommandations.length} reco(s)`)
  if (allocs.unmappedEtfs.length > 0) {
    console.warn(`[aggregateur] ⚠ ${allocs.unmappedEtfs.length} ETF non mappé(s) — secteurs estimés uniquement :`)
    for (const u of allocs.unmappedEtfs) {
      console.warn(`  ${u.isin}  ${u.name}  (${u.value.toFixed(0)}€)`)
    }
    console.warn('  → Ces ISIN à ajouter dans lib/analyse/etfCompositions.ts')
  }

  return { ...partial, scores, recommandations }
}
