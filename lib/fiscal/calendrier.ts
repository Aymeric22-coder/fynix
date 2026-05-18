/**
 * Calendrier fiscal personnalisé — événements pertinents pour
 * l'utilisateur sur les 12 prochains mois.
 *
 * Fonction PURE (pas d'I/O). Le caller (Dashboard) lui passe le profil
 * + les flags d'éligibilité dérivés du patrimoine + les dates d'ouverture
 * connues (PEA, AV). On filtre ensuite les événements sur l'horizon 12
 * mois autour de `now`.
 *
 * Événements gérés (10 règles) :
 *   1. Déclaration revenus 2042              — universel, 25 mai
 *   2. Déclaration IFI                       — si patrimoineNet > 1,3 M€
 *   3. Déclaration revenus fonciers 2044     — si biens en régime réel
 *   4. Déclaration LMNP 2031/2033            — si bien LMNP réel
 *   5. Jalon PEA 5 ans                       — fenêtre des 12 mois autour de l'âge 5 ans
 *   6. Jalon AV 8 ans                        — fenêtre des 12 mois autour de l'âge 8 ans
 *   7. Versement PER avant fin d'année       — si PER + mois >= octobre
 *   8. Plafond Livret A non atteint          — si totalLivretA < 22 950
 *   9. Taxe foncière                         — si biens immo, octobre
 *  10. Taxe habitation résidence secondaire  — si résidence secondaire, novembre
 */

import {
  PEA_PLAFOND_VERSEMENTS,
  LIVRET_A_PLAFOND,
} from '@/lib/analyse/optimiseurFiscal'

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export type CategorieEvenement = 'declaration' | 'echeance' | 'opportunite' | 'jalon'
export type UrgenceEvenement   = 'info' | 'attention' | 'urgent'

export interface EvenementFiscal {
  id:          string
  titre:       string
  description: string
  /** Date de l'événement (UTC, normalisée à minuit). */
  date:        Date
  recurrence:  'annuel' | 'unique'
  categorie:   CategorieEvenement
  urgence:     UrgenceEvenement
  lien_externe?: string
}

/** Inputs minimaux dont la fonction a besoin pour personnaliser le calendrier. */
export interface CalendrierInputs {
  /** Patrimoine net actuel (€) — pour la règle IFI. */
  patrimoineNet:           number
  /** TMI utilisateur (%). Permet de prioriser PER si élevé. */
  tmiPct:                  number | null
  /** Enveloppes déclarées par l'utilisateur (depuis profile.enveloppes). */
  enveloppes:              ReadonlyArray<string>
  /** Régimes fiscaux distincts des biens immo détenus. */
  regimesImmo:             ReadonlyArray<string>
  /** Nombre de biens immobiliers détenus (toutes catégories). */
  nbBiensImmo:             number
  /** True si au moins un bien est une résidence secondaire. */
  hasResidenceSecondaire:  boolean
  /** Date d'ouverture du PEA si connue (ISO YYYY-MM-DD). */
  peaOuvertureDate:        string | null
  /** Date d'ouverture de l'AV si connue. */
  avOuvertureDate:         string | null
  /** Solde total cumulé sur Livret A (€). */
  livretASolde:            number
  /** Date courante (injectable pour les tests). */
  now:                     Date
}

// ─────────────────────────────────────────────────────────────────
// Constantes métier
// ─────────────────────────────────────────────────────────────────

/** Seuil de patrimoine immobilier net déclenchant l'IFI (2026). */
export const IFI_SEUIL_EUR = 1_300_000

/** Horizon de filtrage : on garde les événements dans cet intervalle après `now`. */
const HORIZON_MOIS = 12

// ─────────────────────────────────────────────────────────────────
// Helpers de date (UTC pour reproductibilité tests)
// ─────────────────────────────────────────────────────────────────

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

function addYears(d: Date, years: number): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear() + years,
    d.getUTCMonth(),
    d.getUTCDate(),
  ))
}

function isWithinHorizon(date: Date, now: Date, mois = HORIZON_MOIS): boolean {
  const horizon = new Date(now.getTime())
  horizon.setUTCMonth(horizon.getUTCMonth() + mois)
  return date.getTime() >= now.getTime() && date.getTime() <= horizon.getTime()
}

/**
 * Pour un événement annuel à mois/jour fixés (ex: 25 mai), retourne la
 * prochaine occurrence à partir de `now`. Si l'événement de l'année
 * courante est déjà passé, retourne celui de l'année suivante.
 */
function nextAnnualOccurrence(now: Date, monthIndex: number, day: number): Date {
  const thisYear = utcDate(now.getUTCFullYear(), monthIndex, day)
  if (thisYear.getTime() >= now.getTime()) return thisYear
  return utcDate(now.getUTCFullYear() + 1, monthIndex, day)
}

function hasEnveloppe(list: ReadonlyArray<string>, needle: string): boolean {
  const lower = needle.toLowerCase()
  return list.some((e) => e.toLowerCase().includes(lower))
}

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

/**
 * Construit la liste des événements fiscaux pertinents pour l'utilisateur,
 * triés par date croissante, filtrés sur les 12 prochains mois.
 */
export function getEvenementsFiscaux(inputs: CalendrierInputs): EvenementFiscal[] {
  const out: EvenementFiscal[] = []
  const { now } = inputs

  // ── 1. Déclaration revenus 2042 (universel, 25 mai) ────────────────────
  out.push({
    id:          'declaration-2042',
    titre:       'Déclaration de revenus (2042)',
    description: 'Date limite de la déclaration en ligne — pensez à valider votre formulaire.',
    date:        nextAnnualOccurrence(now, 4, 25), // mai = mois 4 (0-based)
    recurrence:  'annuel',
    categorie:   'declaration',
    urgence:     'attention',
    lien_externe: 'https://www.impots.gouv.fr',
  })

  // ── 2. Déclaration IFI (si patrimoineNet > seuil) ──────────────────────
  if (inputs.patrimoineNet > IFI_SEUIL_EUR) {
    out.push({
      id:          'declaration-ifi',
      titre:       'Déclaration IFI',
      description: `Votre patrimoine net dépasse ${(IFI_SEUIL_EUR / 1000).toFixed(0)} k€. Déclaration jointe à la 2042 (même date).`,
      date:        nextAnnualOccurrence(now, 4, 25),
      recurrence:  'annuel',
      categorie:   'declaration',
      urgence:     'urgent',
    })
  }

  // ── 3. Déclaration revenus fonciers 2044 (si régime réel foncier) ──────
  const aRegimeReel = inputs.regimesImmo.some((r) =>
    r === 'foncier_nu' || r === 'foncier_micro' || r === 'lmnp_reel' || r === 'lmp'
    || r === 'sci_ir' || r === 'sci_is',
  )
  if (aRegimeReel) {
    out.push({
      id:          'declaration-2044',
      titre:       'Déclaration revenus fonciers (2044)',
      description: 'Annexe obligatoire pour les revenus locatifs déclarés au régime réel.',
      date:        nextAnnualOccurrence(now, 4, 25),
      recurrence:  'annuel',
      categorie:   'declaration',
      urgence:     'attention',
    })
  }

  // ── 4. Déclaration LMNP 2031/2033 (3e trimestre, mi-septembre) ────────
  const aLMNPReel = inputs.regimesImmo.includes('lmnp_reel') || inputs.regimesImmo.includes('lmp')
  if (aLMNPReel) {
    out.push({
      id:          'declaration-lmnp-2031',
      titre:       'Déclaration LMNP 2031/2033',
      description: 'Liasse fiscale BIC pour la location meublée — à transmettre au SIE.',
      date:        nextAnnualOccurrence(now, 8, 15), // septembre
      recurrence:  'annuel',
      categorie:   'declaration',
      urgence:     'urgent',
    })
  }

  // ── 5. Jalon PEA 5 ans ─────────────────────────────────────────────────
  if (hasEnveloppe(inputs.enveloppes, 'pea') && inputs.peaOuvertureDate) {
    const ouverture = parseIsoDate(inputs.peaOuvertureDate)
    if (ouverture) {
      const date5ans = addYears(ouverture, 5)
      if (isWithinHorizon(date5ans, now)) {
        out.push({
          id:          'jalon-pea-5ans',
          titre:       'PEA — 5 ans atteints',
          description: `Ton PEA atteint 5 ans le ${formatDateFr(date5ans)}. Retraits exonérés d'impôt sur le revenu (PS 17,2 % maintenus).`,
          date:        date5ans,
          recurrence:  'unique',
          categorie:   'jalon',
          urgence:     'info',
        })
      }
    }
  }

  // ── 6. Jalon AV 8 ans ──────────────────────────────────────────────────
  if (hasEnveloppe(inputs.enveloppes, 'assurance') && inputs.avOuvertureDate) {
    const ouverture = parseIsoDate(inputs.avOuvertureDate)
    if (ouverture) {
      const date8ans = addYears(ouverture, 8)
      if (isWithinHorizon(date8ans, now)) {
        out.push({
          id:          'jalon-av-8ans',
          titre:       'Assurance-vie — 8 ans atteints',
          description: `Abattement annuel 4 600 € (célibataire) / 9 200 € (couple) sur les gains en cas de rachat partiel.`,
          date:        date8ans,
          recurrence:  'unique',
          categorie:   'jalon',
          urgence:     'info',
        })
      }
    }
  }

  // ── 7. Versement PER avant fin d'année (oct/nov/déc + PER ouvert) ──────
  if (hasEnveloppe(inputs.enveloppes, 'per')) {
    const mois = now.getUTCMonth() // 0-based
    if (mois >= 9) { // octobre = 9
      const finAnnee = utcDate(now.getUTCFullYear(), 11, 31)
      const urgence: UrgenceEvenement = mois >= 11 ? 'urgent' : 'attention'
      const semainesRestantes = Math.max(1, Math.ceil((finAnnee.getTime() - now.getTime()) / (7 * 86_400_000)))
      const tmiInfo = inputs.tmiPct !== null && inputs.tmiPct > 0
        ? ` Avec une TMI à ${inputs.tmiPct} %, chaque 1 000 € versés économisent ~${inputs.tmiPct * 10} € d'impôt.`
        : ''
      out.push({
        id:          'per-versement-fin-annee',
        titre:       `Versement PER avant le 31 décembre`,
        description: `Plus que ${semainesRestantes} semaine${semainesRestantes > 1 ? 's' : ''} pour verser sur ton PER et déduire de ton revenu imposable ${now.getUTCFullYear()}.${tmiInfo}`,
        date:        finAnnee,
        recurrence:  'annuel',
        categorie:   'opportunite',
        urgence,
      })
    }
  }

  // ── 8. Plafond Livret A non atteint ────────────────────────────────────
  if (hasEnveloppe(inputs.enveloppes, 'livret a') || hasEnveloppe(inputs.enveloppes, 'livret_a')) {
    if (inputs.livretASolde >= 0 && inputs.livretASolde < LIVRET_A_PLAFOND) {
      const capaciteRestante = LIVRET_A_PLAFOND - inputs.livretASolde
      out.push({
        id:          'livret-a-capacite',
        titre:       'Capacité restante sur ton Livret A',
        description: `Il te reste ${Math.round(capaciteRestante).toLocaleString('fr-FR')} € de capacité avant le plafond de ${LIVRET_A_PLAFOND.toLocaleString('fr-FR')} €.`,
        // On le date sur le mois suivant pour donner un horizon d'action raisonnable.
        date:        endOfNextMonth(now),
        recurrence:  'annuel',
        categorie:   'opportunite',
        urgence:     'info',
      })
    }
  }

  // ── 9. Taxe foncière (si au moins un bien immo, octobre) ───────────────
  if (inputs.nbBiensImmo > 0) {
    out.push({
      id:          'taxe-fonciere',
      titre:       'Taxe foncière',
      description: 'Paiement annuel de la taxe foncière sur tes biens immobiliers (mi-octobre).',
      date:        nextAnnualOccurrence(now, 9, 15),
      recurrence:  'annuel',
      categorie:   'echeance',
      urgence:     'attention',
    })
  }

  // ── 10. Taxe d'habitation résidence secondaire (novembre) ──────────────
  if (inputs.hasResidenceSecondaire) {
    out.push({
      id:          'taxe-habitation-rs',
      titre:       'Taxe d\'habitation (résidence secondaire)',
      description: 'Avis attendu en novembre. La taxe d\'habitation sur la résidence principale est supprimée mais reste due sur la secondaire.',
      date:        nextAnnualOccurrence(now, 10, 15),
      recurrence:  'annuel',
      categorie:   'echeance',
      urgence:     'attention',
    })
  }

  // Filtre horizon + tri chrono
  return out
    .filter((e) => isWithinHorizon(e.date, now))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ─────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────

function parseIsoDate(iso: string): Date | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Renormalise en UTC minuit pour cohérence avec utcDate()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function endOfNextMonth(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  // Dernier jour du mois suivant : avancer au mois +2 et reculer d'un jour
  const after = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0))
  return after.getTime() > next.getTime() ? after : next
}

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day:      'numeric',
    month:    'long',
    year:     'numeric',
    timeZone: 'UTC',
  })
}

// Re-export utile pour les tests
export { PEA_PLAFOND_VERSEMENTS, LIVRET_A_PLAFOND }
