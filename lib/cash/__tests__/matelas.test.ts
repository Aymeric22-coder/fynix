/**
 * Tests du helper `computeMatelasCible` (Cash Refactor V1.0).
 *
 * Couvre les 6 personas de `auditcash.md` + overrides stabilité +
 * cas dégénérés (charges 0, statut null, salaire absent).
 */
import { describe, it, expect } from 'vitest'
import { computeMatelasCible, MATELAS_MULTIPLIERS } from '../matelas'

describe('computeMatelasCible — personas audit', () => {
  it('P1 — CDI débutant (charges 1 800, salaire 2 200)', () => {
    const r = computeMatelasCible({
      chargesMensuelles:  1_800,
      statutPro:          'cdi',
      salaireNetMensuel:  2_200,
    })
    expect(r.applicable).toBe(true)
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.cibleBasseEur).toBe(5_400)
    expect(r.cibleHauteEur).toBe(10_800)
    expect(r.profilRisque).toBe('stable')
    expect(r.moisDeSalaireBasse).toBeCloseTo(5_400 / 2_200, 6)
    expect(r.moisDeSalaireHaute).toBeCloseTo(10_800 / 2_200, 6)
  })

  it('P3 — Indépendant (charges 2 500)', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_500,
      statutPro:         'independant',
    })
    expect(r.multiplicateurMin).toBe(6)
    expect(r.multiplicateurMax).toBe(12)
    expect(r.cibleBasseEur).toBe(15_000)
    expect(r.cibleHauteEur).toBe(30_000)
    expect(r.profilRisque).toBe('volatil')
  })

  it('P6 — Dirigeant (charges 4 000)', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 4_000,
      statutPro:         'dirigeant',
    })
    expect(r.multiplicateurMin).toBe(6)
    expect(r.multiplicateurMax).toBe(12)
    expect(r.cibleBasseEur).toBe(24_000)
    expect(r.cibleHauteEur).toBe(48_000)
    expect(r.profilRisque).toBe('volatil')
  })

  it('CDD — bascule en volatil (6-12)', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 1_500,
      statutPro:         'cdd',
    })
    expect(r.multiplicateurMin).toBe(6)
    expect(r.multiplicateurMax).toBe(12)
    expect(r.cibleBasseEur).toBe(9_000)
    expect(r.cibleHauteEur).toBe(18_000)
    expect(r.profilRisque).toBe('volatil')
  })

  it('Étudiant — multiplicateurs 3-6 avec profil "standard"', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 800,
      statutPro:         'etudiant',
    })
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.profilRisque).toBe('standard')
  })

  it('Retraité — multiplicateurs 3-6 avec profil "stable"', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'retraite',
    })
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.profilRisque).toBe('stable')
  })

  it('Fonction publique — aligné CDI (3-6 stable)', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'fonction_publique',
    })
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.profilRisque).toBe('stable')
  })

  it('Demandeur d\'emploi — volatil 6-12', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 1_500,
      statutPro:         'demandeur_emploi',
    })
    expect(r.multiplicateurMin).toBe(6)
    expect(r.multiplicateurMax).toBe(12)
    expect(r.profilRisque).toBe('volatil')
  })

  it('Sans activité / autre — volatil 6-12 (parking conservateur)', () => {
    for (const statut of ['sans_activite', 'autre'] as const) {
      const r = computeMatelasCible({
        chargesMensuelles: 1_000,
        statutPro:         statut,
      })
      expect(r.multiplicateurMin).toBe(6)
      expect(r.multiplicateurMax).toBe(12)
      expect(r.profilRisque).toBe('volatil')
    }
  })
})

describe('computeMatelasCible — overrides stabilité', () => {
  it('Override "stable" sur indépendant → bascule 3-6 stable', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_500,
      statutPro:         'independant',
      stabiliteRevenus:  'stable',
    })
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.profilRisque).toBe('stable')
  })

  it('Override "instable" sur CDI → force 9-12 volatil', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      stabiliteRevenus:  'instable',
    })
    expect(r.multiplicateurMin).toBe(9)
    expect(r.multiplicateurMax).toBe(12)
    expect(r.profilRisque).toBe('volatil')
    expect(r.cibleBasseEur).toBe(18_000)
    expect(r.cibleHauteEur).toBe(24_000)
  })

  it('Stabilité "moyenne" (non-override) → table statut s\'applique', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      stabiliteRevenus:  'moyenne',
    })
    // Comportement par statut, comme si stabiliteRevenus absent
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.profilRisque).toBe('stable')
  })

  it('Stabilité null explicite → table statut s\'applique', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      stabiliteRevenus:  null,
    })
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
  })

  it('Override stable sans statutPro → applicable (override seul suffit)', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         null,
      stabiliteRevenus:  'stable',
    })
    expect(r.applicable).toBe(true)
    expect(r.multiplicateurMin).toBe(3)
    expect(r.multiplicateurMax).toBe(6)
    expect(r.profilRisque).toBe('stable')
  })
})

describe('computeMatelasCible — données insuffisantes', () => {
  it('charges = 0 → non applicable, raison "charges_manquantes"', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 0,
      statutPro:         'cdi',
    })
    expect(r.applicable).toBe(false)
    expect(r.raisonNonApplicable).toBe('charges_manquantes')
    expect(r.cibleBasseEur).toBeNull()
    expect(r.cibleHauteEur).toBeNull()
  })

  it('charges négatives → non applicable', () => {
    const r = computeMatelasCible({
      chargesMensuelles: -500,
      statutPro:         'cdi',
    })
    expect(r.applicable).toBe(false)
    expect(r.raisonNonApplicable).toBe('charges_manquantes')
  })

  it('charges NaN → non applicable', () => {
    const r = computeMatelasCible({
      chargesMensuelles: Number.NaN,
      statutPro:         'cdi',
    })
    expect(r.applicable).toBe(false)
    expect(r.raisonNonApplicable).toBe('charges_manquantes')
  })

  it('statut null + pas de stabilité → non applicable, raison "statut_manquant"', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         null,
    })
    expect(r.applicable).toBe(false)
    expect(r.raisonNonApplicable).toBe('statut_manquant')
  })

  it('statut null + stabilité "moyenne" (non-override) → non applicable', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         null,
      stabiliteRevenus:  'moyenne',
    })
    expect(r.applicable).toBe(false)
    expect(r.raisonNonApplicable).toBe('statut_manquant')
  })
})

describe('computeMatelasCible — mois de salaire', () => {
  it('salaire fourni → moisDeSalaire calculés', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      salaireNetMensuel: 3_000,
    })
    // cibleBasse = 2 000 × 3 = 6 000 ; 6 000 / 3 000 = 2 mois
    expect(r.moisDeSalaireBasse).toBe(2)
    // cibleHaute = 2 000 × 6 = 12 000 ; 12 000 / 3 000 = 4 mois
    expect(r.moisDeSalaireHaute).toBe(4)
  })

  it('salaire absent → moisDeSalaire à null', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
    })
    expect(r.moisDeSalaireBasse).toBeNull()
    expect(r.moisDeSalaireHaute).toBeNull()
  })

  it('salaire = 0 → moisDeSalaire à null (pas de division par zéro)', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      salaireNetMensuel: 0,
    })
    expect(r.moisDeSalaireBasse).toBeNull()
    expect(r.moisDeSalaireHaute).toBeNull()
  })

  it('salaire négatif → moisDeSalaire à null', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      salaireNetMensuel: -1_000,
    })
    expect(r.moisDeSalaireBasse).toBeNull()
    expect(r.moisDeSalaireHaute).toBeNull()
  })

  it('salaire NaN → moisDeSalaire à null', () => {
    const r = computeMatelasCible({
      chargesMensuelles: 2_000,
      statutPro:         'cdi',
      salaireNetMensuel: Number.NaN,
    })
    expect(r.moisDeSalaireBasse).toBeNull()
    expect(r.moisDeSalaireHaute).toBeNull()
  })
})

describe('MATELAS_MULTIPLIERS — invariants', () => {
  it('exposé pour personnalisation V1.x (single source of truth)', () => {
    expect(MATELAS_MULTIPLIERS.parStatut.cdi.multiplicateurMin).toBe(3)
    expect(MATELAS_MULTIPLIERS.parStatut.cdi.multiplicateurMax).toBe(6)
    expect(MATELAS_MULTIPLIERS.overrideInstable.multiplicateurMin).toBe(9)
    expect(MATELAS_MULTIPLIERS.overrideInstable.multiplicateurMax).toBe(12)
  })

  it('tous les multiplicateurs min ≤ max', () => {
    for (const m of Object.values(MATELAS_MULTIPLIERS.parStatut)) {
      expect(m.multiplicateurMin).toBeLessThanOrEqual(m.multiplicateurMax)
    }
    expect(MATELAS_MULTIPLIERS.overrideStable.multiplicateurMin)
      .toBeLessThanOrEqual(MATELAS_MULTIPLIERS.overrideStable.multiplicateurMax)
    expect(MATELAS_MULTIPLIERS.overrideInstable.multiplicateurMin)
      .toBeLessThanOrEqual(MATELAS_MULTIPLIERS.overrideInstable.multiplicateurMax)
  })
})
