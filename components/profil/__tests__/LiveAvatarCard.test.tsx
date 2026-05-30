/* @vitest-environment jsdom */
/**
 * QW7 — Tests de LiveAvatarCard + computeLiveMetrics.
 *
 * Couvre :
 *   1. computeLiveMetrics — matrice de cas (vide / Step 1 minimal / Step 5
 *      mi-parcours / Step 10 quasi-complet).
 *   2. Section appearance progressive : Step 1 puis Step 2 ajoute Aujourd'hui.
 *   3. Render snapshot textuel à 3 états (sections visibles).
 *   4. Isolation mobile-ready : le composant se rend SEUL (sans
 *      ProfilQuestionnaire parent) — preuve qu'il peut être enveloppé
 *      dans un <Sheet> drawer plus tard sans refacto.
 *   5. CS3 R5 — Expert auto-déclaré affiche un badge distinct (pas un
 *      score chiffré).
 *   6. Skip CS3 R1/R2 — Quiz crypto skippé (non répondu, pas auto-déclaré)
 *      → aucune ligne crypto affichée (pas de "—").
 *   7. Reset (values=EMPTY_VALUES) — pas de crash, header présent.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { computeLiveMetrics, LiveAvatarCard } from '../LiveAvatarCard'
import { EMPTY_VALUES, type QuestionnaireValues } from '../questionnaire-types'
import type { LifeEventDraft } from '../lifeEventsDraft'

afterEach(() => cleanup())

const v = (over: Partial<QuestionnaireValues> = {}): QuestionnaireValues => ({ ...EMPTY_VALUES, ...over })

// ────────────────────────────────────────────────────────────────────
// 1 — computeLiveMetrics pur
// ────────────────────────────────────────────────────────────────────

describe('computeLiveMetrics — états progressifs', () => {
  it('values vides → hasAnyData=false, toutes sections false', () => {
    const m = computeLiveMetrics(EMPTY_VALUES, [])
    expect(m.hasAnyData).toBe(false)
    expect(m.hasIdentity).toBe(false)
    expect(m.hasCashflow).toBe(false)
    expect(m.hasEnveloppes).toBe(false)
    expect(m.hasSavoirs).toBe(false)
    expect(m.hasRisque).toBe(false)
    expect(m.hasFire).toBe(false)
    expect(m.hasLifeEvents).toBe(false)
  })

  it('Step 1 minimal — prenom seul → hasIdentity=true, autres false', () => {
    const m = computeLiveMetrics(v({ prenom: 'Aymeric' }), [])
    expect(m.hasIdentity).toBe(true)
    expect(m.identity.prenom).toBe('Aymeric')
    expect(m.hasCashflow).toBe(false)
    expect(m.hasAnyData).toBe(true)
  })

  it('Step 2 ajout revenus → hasCashflow=true', () => {
    const m = computeLiveMetrics(v({
      prenom: 'Aymeric', age: 35, statut_pro: 'Salarié',
      revenu_mensuel: 3000,
    }), [])
    expect(m.hasCashflow).toBe(true)
    expect(m.cashflow.revenus).toBe(3000)
    expect(m.cashflow.savingsPct).toBe(0)
  })

  it('Step 4 enveloppes → hasEnveloppes (filtre Aucune)', () => {
    const m = computeLiveMetrics(v({ enveloppes: ['PEA', 'CTO', 'Aucune'] }), [])
    expect(m.hasEnveloppes).toBe(true)
    expect(m.envelopeLabels).toEqual(['PEA', 'CTO'])
  })

  it('Step 5 quiz partiel (2/4 répondues) → savoirs.bourse partial', () => {
    const m = computeLiveMetrics(v({ quiz_bourse: [0, 1, -1, -1] }), [])
    expect(m.hasSavoirs).toBe(true)
    expect(m.savoirs).toHaveLength(1)
    expect(m.savoirs[0]!.domain).toBe('bourse')
    expect(m.savoirs[0]!.state).toBe('partial')
    expect(m.savoirs[0]!.correct).toBe(2)  // [0,1,_,_] = 2 correctes
  })

  it('CS3 R5 — Expert auto-déclaré → state=self_expert sans score', () => {
    const m = computeLiveMetrics(v({
      quiz_self_declared_domains: ['crypto'],
      quiz_crypto: [-1, -1, -1, -1],
    }), [])
    expect(m.savoirs).toHaveLength(1)
    expect(m.savoirs[0]!.domain).toBe('crypto')
    expect(m.savoirs[0]!.state).toBe('self_expert')
    expect(m.savoirs[0]!.correct).toBeUndefined()
  })

  it('CS3 R1 — Quiz crypto skippé (pas répondu, pas Expert) → AUCUNE ligne crypto', () => {
    // L'utilisateur a fait Bourse mais skippé Crypto (R1) — pas auto-déclaré.
    const m = computeLiveMetrics(v({
      quiz_bourse: [0, 1, 2, 3],
      quiz_crypto: [-1, -1, -1, -1],  // sentinel "non répondu" (skip CS3)
      quiz_self_declared_domains: [],
    }), [])
    expect(m.savoirs).toHaveLength(1)
    expect(m.savoirs[0]!.domain).toBe('bourse')
    // Pas de ligne crypto — sinon on aurait affiché "—" et c'est interdit.
    expect(m.savoirs.find((s) => s.domain === 'crypto')).toBeUndefined()
  })

  it('Step 8 — risk_1..4 répondus → hasRisque=true', () => {
    const m = computeLiveMetrics(v({
      risk_1: 'A', risk_2: 'B', risk_3: 'C', risk_4: 'D',
    }), [])
    expect(m.hasRisque).toBe(true)
  })

  it('Step 8 FIRE — fire_type + cible → hasFire=true', () => {
    const m = computeLiveMetrics(v({
      fire_type: 'lean', revenu_passif_cible: 2500, age_cible: 55,
    }), [])
    expect(m.hasFire).toBe(true)
    expect(m.fire.cibleMensuelle).toBe(2500)
    expect(m.fire.ageCible).toBe(55)
  })

  it('Step 10 — life events actifs → hasLifeEvents=true', () => {
    const events: LifeEventDraft[] = [
      { type: 'retraite', is_active: true, occurrence_date: '2050-01-01', montant: 2000, label: null, meta: {} },
      { type: 'capital_exceptionnel', is_active: false, occurrence_date: '2032-01-01', montant: 50000, label: 'Héritage', meta: {} },
    ]
    const m = computeLiveMetrics(EMPTY_VALUES, events)
    expect(m.hasLifeEvents).toBe(true)
    // Seul l'event actif est exposé.
    expect(m.lifeEventsActifs).toHaveLength(1)
    expect(m.lifeEventsActifs[0]!.label).toBe('Retraite')
  })
})

// ────────────────────────────────────────────────────────────────────
// 2 — Render textuel
// ────────────────────────────────────────────────────────────────────

describe('LiveAvatarCard render', () => {
  it('values vides → header présent + message d\'attente', () => {
    render(<LiveAvatarCard values={EMPTY_VALUES} lifeEvents={[]} />)
    expect(screen.getByTestId('live-avatar-card')).toBeTruthy()
    expect(screen.getByText(/Ton profil en construction/i)).toBeTruthy()
    expect(screen.getByText(/Les sections appara/i)).toBeTruthy()
  })

  it('Step 1 (prenom + age + statut) → Hero rendu, sections suivantes absentes', () => {
    render(<LiveAvatarCard
      values={v({ prenom: 'Sophie', age: 45, statut_pro: 'Indépendant / Freelance' })}
      lifeEvents={[]}
    />)
    expect(screen.getByText('Sophie')).toBeTruthy()
    expect(screen.getByText(/Indépendant.*45 ans/)).toBeTruthy()
    // pas de section Aujourd'hui (pas de revenus)
    expect(screen.queryByText('Aujourd\'hui')).toBeNull()
  })

  it('Step 5 mi-parcours — Hero + Cashflow + Enveloppes + Savoirs', () => {
    render(<LiveAvatarCard
      values={v({
        prenom: 'Sophie', age: 45, statut_pro: 'Indépendant / Freelance',
        revenu_mensuel: 5000, charges_fixes: 1200, epargne_mensuelle: 1500,
        enveloppes: ['PEA', 'CTO'],
        quiz_bourse: [0, 1, 2, 3],
      })}
      lifeEvents={[]}
    />)
    expect(screen.getByText('Sophie')).toBeTruthy()
    expect(screen.getByText('Aujourd\'hui')).toBeTruthy()
    expect(screen.getByText('Enveloppes')).toBeTruthy()
    expect(screen.getByText('Tes savoirs')).toBeTruthy()
    expect(screen.getByText('Bourse')).toBeTruthy()
    expect(screen.getByText('4/4')).toBeTruthy()
  })

  it('Step 10 quasi-complet — toutes sections rendues', () => {
    render(<LiveAvatarCard
      values={v({
        prenom: 'Sophie', age: 45, statut_pro: 'Indépendant / Freelance',
        revenu_mensuel: 5000, charges_fixes: 1200, epargne_mensuelle: 1500,
        tmi_rate: 41,
        enveloppes: ['PEA', 'CTO', 'Crypto'],
        quiz_bourse: [0, 1, 2, 3], quiz_crypto: [0, 1, 2, 1],
        risk_1: 'A', risk_2: 'B', risk_3: 'C', risk_4: 'D',
        fire_type: 'lean', revenu_passif_cible: 2500, age_cible: 55,
      })}
      lifeEvents={[
        { type: 'retraite', is_active: true, occurrence_date: '2050-01-01', montant: 2000, label: null, meta: {} },
      ]}
    />)
    expect(screen.getByText('Aujourd\'hui')).toBeTruthy()
    expect(screen.getByText('Fiscalité')).toBeTruthy()
    expect(screen.getByText('Enveloppes')).toBeTruthy()
    expect(screen.getByText('Tes savoirs')).toBeTruthy()
    expect(screen.getByText('Profil de risque')).toBeTruthy()
    expect(screen.getByText('Ta cible FIRE')).toBeTruthy()
    expect(screen.getByText('Tes projets')).toBeTruthy()
  })

  it('Reset (values=EMPTY_VALUES) — pas de crash, header visible', () => {
    const { rerender } = render(<LiveAvatarCard
      values={v({ prenom: 'Test', revenu_mensuel: 1000 })}
      lifeEvents={[]}
    />)
    expect(screen.getByText('Test')).toBeTruthy()
    // Simule un reset
    rerender(<LiveAvatarCard values={EMPTY_VALUES} lifeEvents={[]} />)
    expect(screen.queryByText('Test')).toBeNull()
    expect(screen.getByTestId('live-avatar-card')).toBeTruthy()
  })
})

// ────────────────────────────────────────────────────────────────────
// 3 — Isolation mobile-ready
// ────────────────────────────────────────────────────────────────────

describe('LiveAvatarCard — isolation mobile-ready', () => {
  it('se rend en isolation, hors ProfilQuestionnaire, sans erreur', () => {
    // Si ce test passe, on peut envelopper le composant dans <Sheet>
    // drawer mobile plus tard sans refacto.
    expect(() => {
      render(<LiveAvatarCard values={EMPTY_VALUES} lifeEvents={[]} />)
    }).not.toThrow()
    expect(screen.getByTestId('live-avatar-card')).toBeTruthy()
  })
})
