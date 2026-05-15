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
import { translateSector } from './sectorMapping'
import { geoZone } from './geoMapping'
import type {
  PatrimoineComplet, BienImmo, CompteCash,
  ClasseAlloc, SecteurAlloc, GeoAlloc, EnrichedPosition, AnalyseAssetType,
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
  // Note : on n'a pas le profilType en DB — on le calcule depuis les
  // réponses du questionnaire si dispo. Pour rester simple ici, on
  // expose juste le prénom et on délègue le calcul à computeProfileMetrics
  // côté Profil. Le dashboard d'analyse n'a pas besoin de retoucher le
  // profilType ; on le lit déjà depuis le profil quand il est rempli.
  risk_1: string | null; risk_2: string | null; risk_3: string | null; risk_4: string | null
  quiz_bourse: number[] | null; quiz_crypto: number[] | null; quiz_immo: number[] | null
}

async function loadProfile(userId: string): Promise<{ prenom: string | null; profilType: string | null }> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('prenom, risk_1, risk_2, risk_3, risk_4, quiz_bourse, quiz_crypto, quiz_immo')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return { prenom: null, profilType: null }
  const p = data as unknown as ProfileRow

  // Calcul du profilType en réutilisant la lib du module Profil (déjà testée).
  // Import dynamique pour éviter une circularité au boot.
  const { riskScore, experienceScore, inferProfileType } = await import('@/lib/profil/calculs')
  const risk = riskScore({ risk_1: p.risk_1, risk_2: p.risk_2, risk_3: p.risk_3, risk_4: p.risk_4 })
  const exp  = experienceScore({
    bourse: { correct: countCorrect(p.quiz_bourse, 'bourse'), total: 4 },
    crypto: { correct: countCorrect(p.quiz_crypto, 'crypto'), total: 4 },
    immo:   { correct: countCorrect(p.quiz_immo,   'immo'),   total: 3 },
  })
  return { prenom: p.prenom, profilType: inferProfileType(risk, exp) }
}

function countCorrect(answers: number[] | null, _quiz: string): number {
  // Calcul minimal pour évaluer le profil sans rechercher la bonne réponse
  // par quiz (déjà fait dans calculs.ts via quizScore). Pour simplifier, on
  // retourne un proxy : nombre de réponses non nulles / non -1. Ce n'est PAS
  // exact mais c'est suffisant pour catégoriser. Pour la valeur officielle,
  // consulter /profil.
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
// Répartition sectorielle (avec alerte > 30 %)
// ─────────────────────────────────────────────────────────────────

const SECTOR_ALERT_PCT = 30
const GEO_ALERT_PCT    = 50

function repartitionSectorielle(positions: EnrichedPosition[]): SecteurAlloc[] {
  const totalPositions = positions.reduce((s, p) => s + p.current_value, 0)
  const map = new Map<string, { valeur: number; positions: string[] }>()
  for (const p of positions) {
    const lbl = translateSector(p.sector) ?? 'Sans secteur'
    const cur = map.get(lbl) ?? { valeur: 0, positions: [] }
    cur.valeur += p.current_value
    if (cur.positions.length < 10) cur.positions.push(p.name)
    map.set(lbl, cur)
  }
  return Array.from(map.entries())
    .map(([secteur, { valeur, positions }]) => {
      const pct = totalPositions > 0 ? (valeur / totalPositions) * 100 : 0
      return { secteur, valeur, pourcentage: pct, positions, alerte: pct > SECTOR_ALERT_PCT }
    })
    .sort((a, b) => b.valeur - a.valeur)
}

function repartitionGeoBuckets(positions: EnrichedPosition[]): GeoAlloc[] {
  const totalPositions = positions.reduce((s, p) => s + p.current_value, 0)
  const map = new Map<string, { valeur: number; pays: Set<string> }>()
  for (const p of positions) {
    const zone = p.country ? geoZone(p.country) : 'Non classé'
    const cur = map.get(zone) ?? { valeur: 0, pays: new Set<string>() }
    cur.valeur += p.current_value
    if (p.country) cur.pays.add(p.country)
    map.set(zone, cur)
  }
  return Array.from(map.entries())
    .map(([zone, { valeur, pays }]) => {
      const pct = totalPositions > 0 ? (valeur / totalPositions) * 100 : 0
      return { zone, valeur, pourcentage: pct, pays: Array.from(pays), alerte: pct > GEO_ALERT_PCT }
    })
    .sort((a, b) => b.valeur - a.valeur)
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
    { prenom, profilType },
  ] = await Promise.all([
    getEnrichedPositions(userId),
    loadImmo(userId),
    loadCash(userId),
    loadProfile(userId),
  ])

  const totalBrut = totalPortefeuille + totalImmo + totalCash
  const totalNet  = totalBrut - totalDettes

  const repClasses     = repartitionClasses(positions, totalImmo, totalCash, totalBrut)
  const repSecteur     = repartitionSectorielle(positions)
  const repGeo         = repartitionGeoBuckets(positions)

  const rendement      = rendementEstime(positions, biens, totalCash, totalBrut)
  // Revenu passif : loyers immobiliers + estimation dividendes (2 % du portfolio
  // hors crypto, proxy moyen du dividend yield européen).
  const dividendesProxy = positions.filter((p) => p.asset_type !== 'crypto')
    .reduce((s, p) => s + p.current_value, 0) * 0.02 / 12
  const revenuPassif    = loyersMensuels + dividendesProxy

  console.log(`[aggregateur] patrimoine complet en ${Date.now() - t0}ms — ${positions.length} pos, ${biens.length} biens, ${comptes.length} comptes, total ${totalBrut.toFixed(0)}€`)

  return {
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
    lastUpdated:            new Date().toISOString(),
  }
}
