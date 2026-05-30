/**
 * Source de vérité UNIQUE des enveloppes d'investissement (Step 4 du wizard).
 *
 * Tous les modules qui INTERPRÈTENT le contenu de `profile.enveloppes` DOIVENT
 * lire cette constante au lieu de regex/substring-match sur les libellés. Le
 * couplage `regex /crypto/i` × UI provoquait la dette résolue ici : aucune
 * chip "Crypto" n'existait, R1 se déclenchait à 100 %, Quiz Crypto désactivé
 * en prod pour tout user touchant Step 4.
 *
 * Pattern miroir de `lib/profil/lifeEventsConstants.ts` (CS5).
 *
 * IMPORTANT — quand on ajoute/retire une enveloppe :
 *   1. Modifier ENVELOPPE_DEFS ci-dessous (UNE seule fois, partout reflété).
 *   2. Mettre à jour les tests si la matrice persona change.
 *   3. JAMAIS de string magique 'PEA' / 'Crypto' dans le code applicatif —
 *      passer par `findEnvelopeByLabel` ou `envelopeLabelById`.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

/**
 * Classes d'actif POTENTIELLEMENT détenues dans l'enveloppe.
 * Utilisé par le moteur de routage wizard pour décider du skip Quiz Crypto/Immo.
 *
 * Note : CTO peut techniquement détenir crypto (via ETP) mais on garde
 * `equity` seul — l'utilisateur exposé crypto coche la chip Crypto dédiée.
 */
export type EnvelopeAssetClass = 'equity' | 'bonds' | 'crypto' | 'immo' | 'liquid'

/**
 * Tag fiscal — utilisé par `estimerTauxFiscalitePortefeuille` pour pondérer
 * le taux d'imposition moyen sur les revenus du portefeuille au retrait.
 *
 * `null` = enveloppe exclue du calcul portefeuille (typiquement l'immobilier
 * physique, qui a sa propre fiscalité gérée par `immoCalculs`).
 */
export type EnvelopeFiscalKey =
  | 'pea'       // PEA après 5 ans : PS seulement 17.2 %
  | 'av'        // AV après 8 ans : ~24.7 % (PFL + PS)
  | 'cto'       // CTO : PFU 30 %
  | 'per'       // PER : PFU au retrait (simplification)
  | 'livret_a'  // exonéré
  | 'ldds'      // exonéré
  | 'cel_pel'   // PS 17.2 % en pratique mais on assimile au livret réglementé pour le MVP
  | null        // exclu du calcul

export interface EnvelopeDef {
  readonly id:           string
  readonly label:        string
  readonly classes:      readonly EnvelopeAssetClass[]
  readonly fiscalTaxKey: EnvelopeFiscalKey
}

// ────────────────────────────────────────────────────────────────────
// Source unique
// ────────────────────────────────────────────────────────────────────

export const ENVELOPPE_DEFS: ReadonlyArray<EnvelopeDef> = [
  { id: 'pea',     label: 'PEA',                classes: ['equity'],         fiscalTaxKey: 'pea'      },
  { id: 'av',      label: 'Assurance-vie',      classes: ['equity','bonds'], fiscalTaxKey: 'av'       },
  { id: 'cto',     label: 'CTO',                classes: ['equity'],         fiscalTaxKey: 'cto'      },
  { id: 'per',     label: 'PER',                classes: ['equity','bonds'], fiscalTaxKey: 'per'      },
  { id: 'livreta', label: 'Livret A',           classes: ['liquid'],         fiscalTaxKey: 'livret_a' },
  { id: 'ldds',    label: 'LDDS',               classes: ['liquid'],         fiscalTaxKey: 'ldds'     },
  { id: 'celpel',  label: 'CEL / PEL',          classes: ['liquid'],         fiscalTaxKey: 'cel_pel'  },
  // Chips ajoutées par le refactor « dette CS5 » pour permettre aux signaux
  // /crypto/ et /immo/ de R1/R2 d'avoir un état accessible côté UI.
  { id: 'crypto',  label: 'Crypto',             classes: ['crypto'],         fiscalTaxKey: 'cto'      },
  { id: 'immo',    label: 'Immobilier / SCPI',  classes: ['immo'],           fiscalTaxKey: null       },
  { id: 'aucune',  label: 'Aucune',             classes: [],                 fiscalTaxKey: null       },
] as const

/**
 * Tableau historique de libellés exposé pour rétro-compatibilité avec
 * `Step4.tsx > ENVELOPPES.map(...)` et les exports `lib/profil/calculs.ts`.
 * Dérivé strictement depuis ENVELOPPE_DEFS — JAMAIS modifié à la main.
 */
export const ENVELOPPE_LABELS: ReadonlyArray<string> = ENVELOPPE_DEFS.map((d) => d.label)

// ────────────────────────────────────────────────────────────────────
// Helpers — utilisés partout au lieu de string magique
// ────────────────────────────────────────────────────────────────────

export function findEnvelopeByLabel(label: string | null | undefined): EnvelopeDef | null {
  if (!label) return null
  return ENVELOPPE_DEFS.find((d) => d.label === label) ?? null
}

export function findEnvelopeById(id: string): EnvelopeDef | null {
  return ENVELOPPE_DEFS.find((d) => d.id === id) ?? null
}

/** Label canonique pour un id stable — throw si inconnu (= bug code). */
export function envelopeLabelById(id: string): string {
  const def = findEnvelopeById(id)
  if (!def) throw new Error(`[enveloppesConstants] id inconnu : ${id}`)
  return def.label
}

/**
 * True si l'enveloppe (par label) a la classe d'actif demandée.
 * Strict match par label — utilise findEnvelopeByLabel.
 */
export function envelopeHasClass(label: string, cls: EnvelopeAssetClass): boolean {
  return findEnvelopeByLabel(label)?.classes.includes(cls) ?? false
}

/**
 * True si la liste d'enveloppes utilisateur contient AU MOINS une enveloppe
 * exposée à la classe donnée. C'est la primitive utilisée par routing.ts
 * (hasCryptoEnvelope / hasImmoEnvelope).
 */
export function anyEnvelopeHasClass(
  labels: ReadonlyArray<string> | null | undefined,
  cls:    EnvelopeAssetClass,
): boolean {
  if (!labels) return false
  return labels.some((lbl) => envelopeHasClass(lbl, cls))
}
