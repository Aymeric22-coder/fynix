/**
 * Matelas de sécurité — cible €/mois et profil de risque (Cash V1.0).
 *
 * Calcule la cible basse / cible haute du matelas de précaution à partir
 * des charges mensuelles et d'un multiplicateur dépendant du statut
 * professionnel et — en override — de la stabilité des revenus déclarée.
 *
 * Branchement applicatif : **aucun en V1.0**. La V1.1 branchera ce helper
 * dans la page `/cash` (nouveau bloc « Votre matelas ») et dans le score
 * Solidité (`scores.ts`) après mapping `statut_pro` DB → enum local.
 *
 * Référentiel multiplicateurs (MATELAS_MULTIPLIERS) :
 *   - CDI / fonction publique / retraité  → 3-6 mois  (stable)
 *   - Étudiant                             → 3-6 mois  (standard)
 *   - CDD, intérim, demandeur d'emploi     → 6-12 mois (volatil)
 *   - Indép. / TNS / libéral / dirigeant   → 6-12 mois (volatil)
 *   - Sans activité, autre                 → 6-12 mois (volatil)
 *   - Override stabilité = 'stable'        → force 3-6  (stable)
 *   - Override stabilité = 'instable'      → force 9-12 (volatil)
 *
 * Règles :
 *   1. `stabiliteRevenus === 'stable' | 'instable'` override la table statut.
 *   2. Sinon, applique la table par `statutPro`.
 *   3. `chargesMensuelles <= 0` (ou non fini) → `applicable=false`, raison `charges_manquantes`.
 *   4. `statutPro === null` ET stabilité non override → `statut_manquant`.
 *   5. `salaireNetMensuel` absent / ≤ 0 → `moisDeSalaire* = null`, pas de division par zéro.
 *
 * Pur, synchrone, aucun I/O.
 */

export type StatutPro =
  | 'cdi' | 'fonction_publique'
  | 'cdd' | 'interim' | 'demandeur_emploi'
  | 'independant' | 'tns' | 'profession_liberale' | 'dirigeant'
  | 'etudiant' | 'retraite' | 'sans_activite' | 'autre'

export type StabiliteRevenus = 'stable' | 'moyenne' | 'instable' | null

export type ProfilRisque = 'stable' | 'standard' | 'volatil'

export interface MatelasMultiplier {
  multiplicateurMin: number
  multiplicateurMax: number
  profilRisque:      ProfilRisque
}

/**
 * Source de vérité unique des multiplicateurs. Modifiable sans toucher la
 * fonction `computeMatelasCible`. Future V1.x : paramétrage utilisateur.
 */
export const MATELAS_MULTIPLIERS: {
  parStatut:        Record<StatutPro, MatelasMultiplier>
  overrideStable:   MatelasMultiplier
  overrideInstable: MatelasMultiplier
} = {
  parStatut: {
    cdi:                 { multiplicateurMin: 3, multiplicateurMax: 6,  profilRisque: 'stable'   },
    fonction_publique:   { multiplicateurMin: 3, multiplicateurMax: 6,  profilRisque: 'stable'   },
    cdd:                 { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    interim:             { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    demandeur_emploi:    { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    independant:         { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    tns:                 { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    profession_liberale: { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    dirigeant:           { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    etudiant:            { multiplicateurMin: 3, multiplicateurMax: 6,  profilRisque: 'standard' },
    retraite:            { multiplicateurMin: 3, multiplicateurMax: 6,  profilRisque: 'stable'   },
    sans_activite:       { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
    autre:               { multiplicateurMin: 6, multiplicateurMax: 12, profilRisque: 'volatil'  },
  },
  overrideStable:   { multiplicateurMin: 3, multiplicateurMax: 6,  profilRisque: 'stable'  },
  overrideInstable: { multiplicateurMin: 9, multiplicateurMax: 12, profilRisque: 'volatil' },
}

export interface MatelasInput {
  /** Charges fixes mensuelles déclarées (EUR/mois). */
  chargesMensuelles:  number
  /** Statut professionnel mappé (V1.0 : pas de normalisation DB→enum incluse ici). */
  statutPro:          StatutPro | null
  /** Stabilité des revenus déclarée. Override la table statut si 'stable' ou 'instable'. */
  stabiliteRevenus?:  StabiliteRevenus
  /** Salaire net mensuel, optionnel — utilisé uniquement pour `moisDeSalaire*`. */
  salaireNetMensuel?: number
}

export interface MatelasResult {
  /** `false` si données insuffisantes (cf. `raisonNonApplicable`). */
  applicable:           boolean
  raisonNonApplicable?: 'charges_manquantes' | 'statut_manquant'
  multiplicateurMin:    number
  multiplicateurMax:    number
  /** `chargesMensuelles × multiplicateurMin`, ou `null` si non applicable. */
  cibleBasseEur:        number | null
  cibleHauteEur:        number | null
  /** `cibleBasseEur / salaireNetMensuel`, ou `null` si salaire absent / ≤ 0. */
  moisDeSalaireBasse:   number | null
  moisDeSalaireHaute:   number | null
  profilRisque:         ProfilRisque
}

const NON_APPLICABLE_BASE = {
  multiplicateurMin: 0,
  multiplicateurMax: 0,
  cibleBasseEur:     null,
  cibleHauteEur:     null,
  moisDeSalaireBasse: null,
  moisDeSalaireHaute: null,
  profilRisque:      'standard' as ProfilRisque,
}

export function computeMatelasCible(input: MatelasInput): MatelasResult {
  const { chargesMensuelles, statutPro, stabiliteRevenus, salaireNetMensuel } = input

  // Validation 1 — charges
  if (!Number.isFinite(chargesMensuelles) || chargesMensuelles <= 0) {
    return {
      applicable:          false,
      raisonNonApplicable: 'charges_manquantes',
      ...NON_APPLICABLE_BASE,
    }
  }

  // Validation 2 — statut OU override de stabilité
  const hasOverride = stabiliteRevenus === 'stable' || stabiliteRevenus === 'instable'
  if (statutPro === null && !hasOverride) {
    return {
      applicable:          false,
      raisonNonApplicable: 'statut_manquant',
      ...NON_APPLICABLE_BASE,
    }
  }

  // Choix du multiplicateur — override prioritaire sur la table statut
  let mult: MatelasMultiplier
  if (stabiliteRevenus === 'instable') {
    mult = MATELAS_MULTIPLIERS.overrideInstable
  } else if (stabiliteRevenus === 'stable') {
    mult = MATELAS_MULTIPLIERS.overrideStable
  } else if (statutPro !== null) {
    mult = MATELAS_MULTIPLIERS.parStatut[statutPro]
  } else {
    // Inatteignable (couvert par les validations) — branche défensive.
    mult = MATELAS_MULTIPLIERS.parStatut.autre
  }

  const cibleBasseEur = chargesMensuelles * mult.multiplicateurMin
  const cibleHauteEur = chargesMensuelles * mult.multiplicateurMax

  const salaire = salaireNetMensuel
  const salaireValide = typeof salaire === 'number' && Number.isFinite(salaire) && salaire > 0
  const moisDeSalaireBasse = salaireValide ? cibleBasseEur / salaire : null
  const moisDeSalaireHaute = salaireValide ? cibleHauteEur / salaire : null

  return {
    applicable:         true,
    multiplicateurMin:  mult.multiplicateurMin,
    multiplicateurMax:  mult.multiplicateurMax,
    cibleBasseEur,
    cibleHauteEur,
    moisDeSalaireBasse,
    moisDeSalaireHaute,
    profilRisque:       mult.profilRisque,
  }
}
