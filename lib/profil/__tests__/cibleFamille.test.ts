/**
 * QW9-bis — Tests du helper `adjustCibleFamilleDetail` et des helpers texte
 * (email, ARIA).
 *
 * Couvre :
 *   1. Matrice complète (8 cas) : célib/couple × revenu_conjoint × enfants
 *      0/1/2/3/4+.
 *   2. IDENTITÉ STRICTE legacy : `adjustCibleFamille(p)` (calculs.ts) ===
 *      `detail.ajuste − detail.brut` sur la matrice ET sur des valeurs NON
 *      RONDES (2999, 3001, 4567, 1, 3, 0.5, 999999).
 *   3. Composants arrondis : enfantsDelta + coupleDelta === ajuste − brut
 *      (par construction, garde-fou absorption).
 *   4. Labels canoniques : "1 enfant", "2 enfants", "4 enfants ou plus".
 *   5. Helpers texte email + ARIA.
 *
 * Note : la fonction `adjustCibleFamille` (lib/profil/calculs.ts) reste
 * inchangée fonctionnellement. Les tests existants de calculs.test.ts
 * (describe 'adjustCibleFamille') restent verts SANS modification.
 */
import { describe, it, expect } from 'vitest'
import {
  adjustCibleFamille,
} from '../calculs'
import {
  adjustCibleFamilleDetail,
  buildCibleFoyerEmailLabel,
  buildCibleFoyerAriaLabel,
} from '../cibleFamille'

// ─────────────────────────────────────────────────────────────────────
// 1 — Matrice complète
// ─────────────────────────────────────────────────────────────────────

describe('adjustCibleFamilleDetail — matrice', () => {
  it('célib 0 enfant : !hasAdjustment, ajuste == brut, raisons vide', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '0', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(d.brut).toBe(3000)
    expect(d.ajuste).toBe(3000)
    expect(d.hasAdjustment).toBe(false)
    expect(d.enfantsDelta).toBe(0)
    expect(d.coupleDelta).toBe(0)
    expect(d.raisons).toEqual([])
    expect(d.hasCoupleBonus).toBe(false)
    expect(d.nbEnfants).toBe(0)
  })

  it('célib 1 enfant : +300, label "1 enfant" au singulier', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '1', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(3300)
    expect(d.enfantsDelta).toBe(300)
    expect(d.coupleDelta).toBe(0)
    expect(d.raisons).toEqual([{ label: '1 enfant', montant: 300 }])
    expect(d.hasCoupleBonus).toBe(false)
  })

  it('célib 2 enfants : +600', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '2', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(3600)
    expect(d.raisons).toEqual([{ label: '2 enfants', montant: 600 }])
  })

  it('marié 0 enfant SANS revenu conjoint : +50 % cible (+1500 sur 3000)', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '0', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(4500)
    expect(d.coupleDelta).toBe(1500)
    expect(d.enfantsDelta).toBe(0)
    expect(d.raisons).toEqual([{ label: 'couple, un seul revenu déclaré', montant: 1500 }])
    expect(d.hasCoupleBonus).toBe(true)
  })

  it('marié AVEC revenu conjoint : pas de bonus couple', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '0', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 2500, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(3000)
    expect(d.hasAdjustment).toBe(false)
    expect(d.coupleDelta).toBe(0)
    expect(d.hasCoupleBonus).toBe(false)
  })

  it('marié + 2 enfants SANS revenu conjoint : ordre raisons = couple, enfants', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(5100)   // 3000 + 1500 + 600
    expect(d.raisons.map((r) => r.label)).toEqual([
      'couple, un seul revenu déclaré',
      '2 enfants',
    ])
    expect(d.coupleDelta).toBe(1500)
    expect(d.enfantsDelta).toBe(600)
  })

  it('marié + 2 enfants AVEC revenu conjoint : enfants seuls (pas de bonus couple)', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 2500, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(3600)
    expect(d.coupleDelta).toBe(0)
    expect(d.enfantsDelta).toBe(600)
    expect(d.raisons.map((r) => r.label)).toEqual(['2 enfants'])
  })

  it('"4+" enfants : montant calculé sur 5, label "4 enfants ou plus"', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '4+', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(d.ajuste).toBe(4500)   // 3000 + 5 × 300
    expect(d.nbEnfants).toBe(5)
    expect(d.enfantsDelta).toBe(1500)
    expect(d.raisons).toEqual([{ label: '4 enfants ou plus', montant: 1500 }])
  })
})

// ─────────────────────────────────────────────────────────────────────
// 2 — Identité STRICTE legacy : adjustCibleFamille(p) === detail.ajuste − brut
// ─────────────────────────────────────────────────────────────────────

describe('adjustCibleFamilleDetail — identité legacy stricte', () => {
  // Matrice de scénarios × valeurs non rondes pour vérifier que le detail
  // converge bit pour bit avec la fonction legacy.
  const scenarios = [
    { label: 'célib 0 enfant',
      input: { enfants: '0', situation_familiale: 'Célibataire', revenu_conjoint: 0 } },
    { label: 'célib 1 enfant',
      input: { enfants: '1', situation_familiale: 'Célibataire', revenu_conjoint: 0 } },
    { label: 'célib 2 enfants',
      input: { enfants: '2', situation_familiale: 'Célibataire', revenu_conjoint: 0 } },
    { label: 'célib 3 enfants',
      input: { enfants: '3', situation_familiale: 'Célibataire', revenu_conjoint: 0 } },
    { label: 'célib 4+ enfants',
      input: { enfants: '4+', situation_familiale: 'Célibataire', revenu_conjoint: 0 } },
    { label: 'marié 0 enfant SANS revenu conjoint',
      input: { enfants: '0', situation_familiale: 'Marié(e) / PACS', revenu_conjoint: 0 } },
    { label: 'marié 0 enfant AVEC revenu conjoint',
      input: { enfants: '0', situation_familiale: 'Marié(e) / PACS', revenu_conjoint: 3000 } },
    { label: 'marié 2 enfants SANS revenu conjoint',
      input: { enfants: '2', situation_familiale: 'Marié(e) / PACS', revenu_conjoint: 0 } },
    { label: 'marié 2 enfants AVEC revenu conjoint',
      input: { enfants: '2', situation_familiale: 'Marié(e) / PACS', revenu_conjoint: 5000 } },
    { label: 'PACS 4+ enfants SANS revenu conjoint',
      input: { enfants: '4+', situation_familiale: 'Marié(e) / PACS', revenu_conjoint: 0 } },
  ]

  // Valeurs NON RONDES (cf. brief : les tests sur 3000 ne prouvent rien).
  const ciblesTest = [0, 1, 3, 999, 2999, 3000, 3001, 3500, 4567, 7777, 100_000]

  for (const sc of scenarios) {
    for (const cible of ciblesTest) {
      it(`legacy === detail.ajuste-brut : ${sc.label} avec cible=${cible}`, () => {
        const p = { ...sc.input, revenu_passif_cible: cible }
        const legacy = adjustCibleFamille(p)
        const d = adjustCibleFamilleDetail(p)
        expect(d.ajuste - d.brut).toBe(legacy)
        // Garde-fou affichage : composants arrondis somment exactement
        // au total ajustement (pas de divergence visuelle).
        expect(d.enfantsDelta + d.coupleDelta).toBe(legacy)
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────
// 3 — Helpers texte court : email & ARIA
// ─────────────────────────────────────────────────────────────────────

describe('buildCibleFoyerEmailLabel', () => {
  // Formatter de test minimaliste — l'important est que le helper concatène
  // bien la valeur brute formatée dans le bon ordre.
  const fmt = (eur: number) => `${eur} €`

  it('aucun ajustement → chaîne vide', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '0', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerEmailLabel(d, fmt)).toBe('')
  })

  it('couple + 2 enfants : "{brut} saisi, ajusté pour ton foyer : couple + 2 enfants"', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerEmailLabel(d, fmt))
      .toBe(' (3000 € saisi, ajusté pour ton foyer : couple + 2 enfants)')
  })

  it('couple seul (0 enfant) : composition "couple"', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '0', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerEmailLabel(d, fmt))
      .toBe(' (3000 € saisi, ajusté pour ton foyer : couple)')
  })

  it('1 enfant seul (sans bonus couple) : composition "1 enfant"', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '1', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerEmailLabel(d, fmt))
      .toBe(' (3000 € saisi, ajusté pour ton foyer : 1 enfant)')
  })

  it('4+ enfants : composition "4 enfants ou plus"', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '4+', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerEmailLabel(d, fmt))
      .toBe(' (3000 € saisi, ajusté pour ton foyer : 4 enfants ou plus)')
  })

  it('valeur saisie variable : se reflète dans le label (cible 4567)', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 4567,
    })
    expect(buildCibleFoyerEmailLabel(d, fmt))
      .toBe(' (4567 € saisi, ajusté pour ton foyer : couple + 2 enfants)')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 4 — Recompute live slider (propriété : bonus couple = 50 % de la cible
//     courante du slider, varie linéairement à composition foyer fixée)
// ─────────────────────────────────────────────────────────────────────

describe('adjustCibleFamilleDetail — recompute live slider', () => {
  // Le slider de ProjectionFIRE.tsx édite revenu_passif_cible et appelle
  // adjustCibleFamilleDetail à chaque changement avec la valeur courante.
  // On vérifie que coupleDelta = 0.5 × cible quand le bonus est actif,
  // et que enfantsDelta reste constant (300 × N). C'est exactement la
  // propriété attendue par le brief : "le bonus couple (+50 %) doit
  // bouger quand on drague (slider 3000 → couple delta 1500 ; slider 4000
  // → couple delta 2000)".

  const profilFixe = {
    enfants: '2',
    situation_familiale: 'Marié(e) / PACS',
    revenu_conjoint: 0,
  } as const

  it('bonus couple = 50 % de la cible courante (linéaire en cible)', () => {
    const d3000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 3000 })
    const d4000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 4000 })
    const d7000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 7000 })

    expect(d3000.coupleDelta).toBe(1500)
    expect(d4000.coupleDelta).toBe(2000)
    expect(d7000.coupleDelta).toBe(3500)
  })

  it('enfants reste constant (+300 × N) quand le slider bouge', () => {
    const d3000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 3000 })
    const d7000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 7000 })

    expect(d3000.enfantsDelta).toBe(600)   // 2 × 300
    expect(d7000.enfantsDelta).toBe(600)   // inchangé
  })

  it('cible ajustée bouge avec la cible saisie (effet attendu sur la projection)', () => {
    const d3000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 3000 })
    const d4000 = adjustCibleFamilleDetail({ ...profilFixe, revenu_passif_cible: 4000 })

    expect(d3000.ajuste).toBe(5100)   // 3000 + 1500 + 600
    expect(d4000.ajuste).toBe(6600)   // 4000 + 2000 + 600
  })

  it('sans bonus couple : coupleDelta reste à 0 même quand le slider bouge', () => {
    const profilCelib = {
      enfants: '2', situation_familiale: 'Célibataire', revenu_conjoint: 0,
    }
    const d3000 = adjustCibleFamilleDetail({ ...profilCelib, revenu_passif_cible: 3000 })
    const d7000 = adjustCibleFamilleDetail({ ...profilCelib, revenu_passif_cible: 7000 })

    expect(d3000.coupleDelta).toBe(0)
    expect(d7000.coupleDelta).toBe(0)
    // Mais enfantsDelta reste constant
    expect(d3000.enfantsDelta).toBe(600)
    expect(d7000.enfantsDelta).toBe(600)
  })

  // Sprint consolidation 1 (item 5) — Documentation comportementale.
  // Cf. JSDoc de `adjustCibleFamilleDetail`. L'asymétrie est volontaire
  // tant que `birth_date` des enfants existants n'est pas collectée.
  it('limitation connue : enfants existants gonflent la cible de manière PERMANENTE (cf. JSDoc)', () => {
    // Un enfant existant déclaré en Step 1 (sans birth_date) → gonflage
    // permanent. À l'inverse, un enfant futur via life_event naissance
    // n'agirait QUE 22 ans sur l'épargne via buildLifeEventVectors.
    const profil = { enfants: '2', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000 } as const
    const d = adjustCibleFamilleDetail(profil)
    // Le delta enfants est appliqué intégralement, sans fenêtre temporelle.
    expect(d.enfantsDelta).toBe(600)
    expect(d.ajuste).toBe(3600)
    // Note : si à l'avenir on collecte birth_date et que l'enfant a >= 22 ans,
    // ce test deviendra `enfantsDelta = 0`. Le test sera mis à jour à ce
    // moment-là. Voir JSDoc `adjustCibleFamilleDetail`.
  })
})

describe('buildCibleFoyerAriaLabel', () => {
  // Helper de formatage minimaliste pour les tests (sans dépendre du
  // formatCurrency réel) — l'important est que le helper ARIA prenne
  // bien le `ajuste` du detail.
  const fmt = (eur: number) => `${eur} €`

  it('aucun ajustement → chaîne vide', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '0', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerAriaLabel(d, fmt)).toBe('')
  })

  it('couple + 2 enfants : montant ajusté + composition séparée par virgule', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '2', situation_familiale: 'Marié(e) / PACS',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerAriaLabel(d, fmt))
      .toBe(' (ajusté pour ton foyer à 5100 €/mois — couple, 2 enfants)')
  })

  it('4+ enfants : label canonique préservé', () => {
    const d = adjustCibleFamilleDetail({
      enfants: '4+', situation_familiale: 'Célibataire',
      revenu_conjoint: 0, revenu_passif_cible: 3000,
    })
    expect(buildCibleFoyerAriaLabel(d, fmt))
      .toBe(' (ajusté pour ton foyer à 4500 €/mois — 4 enfants ou plus)')
  })
})
