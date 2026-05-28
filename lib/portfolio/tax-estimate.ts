/**
 * Estimation INDICATIVE de la fiscalite sur les plus-values realisees
 * par enveloppe (PEA, CTO, AV, PER, crypto).
 *
 * ⚠️ ESTIMATION COSMETIQUE — ne constitue JAMAIS un conseil fiscal.
 *   - Couvre uniquement les PV REALISEES sur 12 mois glissants
 *     (hors dividendes, coupons, revenus fonciers).
 *   - Pour PEA/AV : l'impot n'est du qu'au RETRAIT. Chaque vente interne
 *     est ici comptee comme imposable → c'est un MAJORANT (surestimation).
 *   - Lecture seule du foyer fiscal, aucune ecriture.
 *
 * Tous les taux sont des constantes nommees (la loi change). Module pur,
 * browser-safe, `now` injectable pour la testabilite.
 */

import { normalizeSituationFamiliale } from '@/lib/profil/calculs'

// ─── Constantes fiscales (LF en vigueur — a reverifier chaque annee) ─────────

const PRELEV_SOCIAUX      = 0.172   // 17,2 % prelevements sociaux
const PFU_TOTAL           = 0.30    // 30 % (PFU 12,8 % IR + 17,2 % PS)
const AV_ABATTEMENT_SEUL  = 4600    // abattement annuel AV > 8 ans, personne seule
const AV_ABATTEMENT_COUPLE = 9200   // abattement annuel AV > 8 ans, couple (foyer fiscal commun)
const AV_TAUX_REDUIT_IR   = 0.075   // 7,5 % IR (primes <= 150k€) au-dela de l'abattement
const PEA_SEUIL_ANNEES    = 5
const AV_SEUIL_ANNEES     = 8

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

// ─── Types publics ───────────────────────────────────────────────────────────

export interface FoyerFiscalContext {
  /** profiles.situation_familiale (libelle questionnaire ou null). */
  situationFamiliale: string | null
  /** profiles.foyer_fiscal_parts (defaut 1.0 cote DB). */
  foyerFiscalParts:   number | null
}

export interface EnvelopeTaxInput {
  envelopeId:     string
  /** EnvelopeType : 'pea' | 'cto' | 'assurance_vie' | 'per' | 'wallet_crypto' | 'other'. */
  envelopeType:   string
  envelopeLabel:  string
  /** ISO date d'ouverture (pour seuils 5 ans PEA / 8 ans AV). null si inconnue. */
  openingDate:    string | null
  /** PV realisee 12 mois glissants, en devise ref. null si aucune vente. */
  realizedPnlTtm: number | null
}

export interface EnvelopeTaxEstimate {
  envelopeId:     string
  envelopeType:   string
  envelopeLabel:  string
  realizedPnlTtm: number
  /** Assiette imposable apres abattement eventuel. 0 si non estimable ou PV <= 0. */
  taxableBase:    number
  /** Impot estime. null si non estimable (PER, type inconnu). */
  estimatedTax:   number | null
  /** estimatedTax / realizedPnlTtm. null si non estimable ou PV <= 0. */
  effectiveRate:  number | null
  /** Libelle du regime applique (ex: "PFU 30 %", "PEA > 5 ans : PS 17,2 %"). */
  regimeLabel:    string
  isEstimable:    boolean
  notes:          string[]
}

// ─── Helpers internes ──────────────────────────────────────────────────────

/**
 * Determine si le foyer beneficie de l'abattement AV couple (9 200 €).
 * Foyer fiscal COMMUN = marie ou pacse (le concubinage "En couple" =
 * 2 foyers fiscaux distincts → abattement individuel).
 *
 * Fallback si situation indisponible : foyer_fiscal_parts >= 2.
 *
 * @returns isCouple + une note tracant la base de classification.
 */
function resolveFoyer(foyer: FoyerFiscalContext): { isCouple: boolean; note: string } {
  const norm = normalizeSituationFamiliale(foyer.situationFamiliale)
  if (norm === 'marie' || norm === 'pacse') {
    return { isCouple: true, note: 'Foyer marié/PACS : abattement couple 9 200 € appliqué.' }
  }
  if (norm === 'celibataire' || norm === 'autre' || norm === 'couple') {
    const detail = norm === 'couple'
      ? 'Concubinage (foyers fiscaux distincts) : abattement individuel 4 600 €.'
      : 'Foyer célibataire : abattement individuel 4 600 €.'
    return { isCouple: false, note: detail }
  }
  // Situation indisponible → repli sur le nombre de parts.
  const parts = foyer.foyerFiscalParts ?? 1
  if (parts >= 2) {
    return {
      isCouple: true,
      note: 'Situation familiale inconnue : couple déduit du nombre de parts (≥ 2) → abattement 9 200 €.',
    }
  }
  return {
    isCouple: false,
    note: 'Situation familiale inconnue : abattement individuel 4 600 € par défaut.',
  }
}

/** Anciennete en annees depuis openingDate. null si date absente/invalide. */
function yearsSince(openingDate: string | null, now: Date): number | null {
  if (!openingDate) return null
  const t = new Date(openingDate).getTime()
  if (!Number.isFinite(t)) return null
  return (now.getTime() - t) / MS_PER_YEAR
}

/** Note "majorant" pour les enveloppes a fiscalite differee (PEA, AV). */
const MAJORANT_NOTE =
  "Majorant : l'impôt n'est dû qu'au retrait — chaque vente interne est ici comptée comme imposable."

// ─── API publique ─────────────────────────────────────────────────────────────

export interface EstimateEnvelopeTaxOptions {
  /** Part de l'abattement AV foyer allouee a CETTE enveloppe (Option B, prorata). 0 sinon. */
  avAbattementShare?: number
  /** Note de classification du foyer (couple/seul), ajoutee aux AV >= 8 ans. */
  foyerNote?:         string
}

/**
 * Estime l'impot d'UNE enveloppe selon le modele valide.
 * L'abattement AV (>= 8 ans) doit etre pre-calcule et passe via
 * `options.avAbattementShare` (reparti au prorata par estimatePortfolioTax).
 */
export function estimateEnvelopeTax(
  input:   EnvelopeTaxInput,
  now:     Date = new Date(),
  options: EstimateEnvelopeTaxOptions = {},
): EnvelopeTaxEstimate {
  const pv = input.realizedPnlTtm ?? 0
  const type = input.envelopeType

  // Squelette commun
  const base: Omit<EnvelopeTaxEstimate, 'taxableBase' | 'estimatedTax' | 'effectiveRate' | 'regimeLabel' | 'isEstimable' | 'notes'> = {
    envelopeId:     input.envelopeId,
    envelopeType:   input.envelopeType,
    envelopeLabel:  input.envelopeLabel,
    realizedPnlTtm: pv,
  }

  // Non estimables : PER (sortie specifique) + type inconnu (wrapper non identifie).
  if (type === 'per') {
    return {
      ...base,
      taxableBase:   0,
      estimatedTax:  null,
      effectiveRate: null,
      regimeLabel:   'Non estimé (sortie PER spécifique)',
      isEstimable:   false,
      notes:         ['Fiscalité de sortie du PER hors périmètre de cette estimation.'],
    }
  }
  if (type !== 'cto' && type !== 'wallet_crypto' && type !== 'pea' && type !== 'assurance_vie') {
    // 'other' ou tout type non reconnu : on ne devine pas (un Livret A serait
    // exonere, un wrapper etranger aurait sa propre regle).
    return {
      ...base,
      taxableBase:   0,
      estimatedTax:  null,
      effectiveRate: null,
      regimeLabel:   'Non estimé (type d\'enveloppe non fiscalisé ici)',
      isEstimable:   false,
      notes:         ['Type d\'enveloppe générique : fiscalité non devinée.'],
    }
  }

  // PV <= 0 : pas de moins-value valorisee → impot 0.
  if (pv <= 0) {
    return {
      ...base,
      taxableBase:   0,
      estimatedTax:  0,
      effectiveRate: null,
      regimeLabel:   'Pas de PV imposable',
      isEstimable:   true,
      notes:         pv < 0 ? ['Moins-value réalisée : non valorisée dans cette estimation.'] : [],
    }
  }

  // ── CTO : PFU 30 % sur chaque cession (reellement imposable, pas de majorant) ──
  if (type === 'cto') {
    const tax = pv * PFU_TOTAL
    return {
      ...base,
      taxableBase:   pv,
      estimatedTax:  tax,
      effectiveRate: tax / pv,
      regimeLabel:   'PFU 30 %',
      isEstimable:   true,
      notes:         [],
    }
  }

  // ── Crypto : PFU 30 % (art. 150 VH bis) ──
  if (type === 'wallet_crypto') {
    const tax = pv * PFU_TOTAL
    return {
      ...base,
      taxableBase:   pv,
      estimatedTax:  tax,
      effectiveRate: tax / pv,
      regimeLabel:   'PFU 30 % (art. 150 VH bis)',
      isEstimable:   true,
      notes:         [],
    }
  }

  // ── PEA ──
  if (type === 'pea') {
    const age = yearsSince(input.openingDate, now)
    if (age === null) {
      const tax = pv * PFU_TOTAL
      return {
        ...base,
        taxableBase:   pv,
        estimatedTax:  tax,
        effectiveRate: tax / pv,
        regimeLabel:   'PEA : PFU 30 % (ancienneté inconnue)',
        isEstimable:   true,
        notes:         ['Date d\'ouverture absente : régime par défaut (PFU 30 %, le moins favorable).', MAJORANT_NOTE],
      }
    }
    if (age >= PEA_SEUIL_ANNEES) {
      const tax = pv * PRELEV_SOCIAUX
      return {
        ...base,
        taxableBase:   pv,
        estimatedTax:  tax,
        effectiveRate: tax / pv,
        regimeLabel:   'PEA > 5 ans : PS 17,2 % (IR exonéré)',
        isEstimable:   true,
        notes:         [MAJORANT_NOTE],
      }
    }
    const tax = pv * PFU_TOTAL
    return {
      ...base,
      taxableBase:   pv,
      estimatedTax:  tax,
      effectiveRate: tax / pv,
      regimeLabel:   'PEA < 5 ans : PFU 30 %',
      isEstimable:   true,
      notes:         [MAJORANT_NOTE],
    }
  }

  // ── Assurance-Vie ──
  // type === 'assurance_vie'
  const age = yearsSince(input.openingDate, now)
  if (age === null) {
    const tax = pv * PFU_TOTAL
    return {
      ...base,
      taxableBase:   pv,
      estimatedTax:  tax,
      effectiveRate: tax / pv,
      regimeLabel:   'AV : PFU 30 % (ancienneté inconnue)',
      isEstimable:   true,
      notes:         ['Date d\'ouverture absente : régime par défaut (PFU 30 %, le moins favorable).', MAJORANT_NOTE],
    }
  }
  if (age >= AV_SEUIL_ANNEES) {
    const share = options.avAbattementShare ?? 0
    const taxableBase = Math.max(0, pv - share)
    const tax = taxableBase * (AV_TAUX_REDUIT_IR + PRELEV_SOCIAUX)  // 24,7 %
    const notes = [MAJORANT_NOTE]
    if (share > 0) {
      notes.push(`Abattement foyer ${Math.round(share)} € appliqué (prorata PV entre contrats AV ≥ 8 ans).`)
    }
    if (options.foyerNote) notes.push(options.foyerNote)
    return {
      ...base,
      taxableBase,
      estimatedTax:  tax,
      effectiveRate: pv > 0 ? tax / pv : null,
      regimeLabel:   'AV > 8 ans : abattement + 24,7 %',
      isEstimable:   true,
      notes,
    }
  }
  const tax = pv * PFU_TOTAL
  return {
    ...base,
    taxableBase:   pv,
    estimatedTax:  tax,
    effectiveRate: tax / pv,
    regimeLabel:   'AV < 8 ans : PFU 30 %',
    isEstimable:   true,
    notes:         [MAJORANT_NOTE],
  }
}

/**
 * Estime l'impot de TOUTES les enveloppes.
 *
 * Pre-calcule l'abattement AV foyer (Option B) : un seul abattement global
 * (4 600 / 9 200 €) reparti AU PRORATA de la PV realisee entre les contrats
 * AV >= 8 ans dont la PV est positive. Une enveloppe sans vente
 * (realizedPnlTtm null) est exclue.
 */
export function estimatePortfolioTax(
  envelopes: EnvelopeTaxInput[],
  foyer:     FoyerFiscalContext,
  now:       Date = new Date(),
): EnvelopeTaxEstimate[] {
  const { isCouple, note: foyerNote } = resolveFoyer(foyer)
  const abattementFoyer = isCouple ? AV_ABATTEMENT_COUPLE : AV_ABATTEMENT_SEUL

  // Enveloppes a estimer : celles ayant une PV realisee non-null.
  const candidates = envelopes.filter((e) => e.realizedPnlTtm !== null)

  // Pre-calcul : AV >= 8 ans avec PV > 0 → base de repartition de l'abattement.
  const avEligibles = candidates.filter(
    (e) =>
      e.envelopeType === 'assurance_vie' &&
      (e.realizedPnlTtm ?? 0) > 0 &&
      (yearsSince(e.openingDate, now) ?? 0) >= AV_SEUIL_ANNEES,
  )
  const totalAvPv = avEligibles.reduce((s, e) => s + (e.realizedPnlTtm ?? 0), 0)

  return candidates.map((env) => {
    let avShare = 0
    if (totalAvPv > 0 && avEligibles.some((e) => e.envelopeId === env.envelopeId)) {
      avShare = abattementFoyer * ((env.realizedPnlTtm ?? 0) / totalAvPv)
    }
    return estimateEnvelopeTax(env, now, { avAbattementShare: avShare, foyerNote })
  })
}
