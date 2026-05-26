/**
 * V11 — Tests du helper `computeUnpaidRentAlerts` (CAS-DASH-001 / INTEG-003).
 *
 * Cible la sémantique des seuils + l'agrégation multi-bien + le retour
 * de `totalUnpaidEur` en valeur POSITIVE (amount_eur stocké négatif en DB).
 */
import { describe, it, expect } from 'vitest'
import {
  computeUnpaidRentAlerts,
  UNPAID_RENT_WARNING_DAYS,
  UNPAID_RENT_CRITICAL_DAYS,
  type UnpaidRentEventLike,
} from '../property-alerts'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TODAY = new Date('2026-05-26T12:00:00Z')

function daysAgo(n: number): string {
  const d = new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]!
}

function unpaid(
  propertyId: string,
  daysOld:    number,
  amountEur:  number = -650,
  isResolved: boolean = false,
): UnpaidRentEventLike {
  return {
    property_id:  propertyId,
    kind:         'rent_unpaid',
    is_resolved:  isResolved,
    event_date:   daysAgo(daysOld),
    amount_eur:   amountEur,
  }
}

// ─── Filtrage ───────────────────────────────────────────────────────────────

describe('V11 — computeUnpaidRentAlerts : filtrage', () => {
  it('aucun event : retourne tableau vide', () => {
    expect(computeUnpaidRentAlerts([], TODAY)).toEqual([])
  })

  it('ignore les events d\'un autre kind', () => {
    const events: UnpaidRentEventLike[] = [
      { property_id: 'p1', kind: 'vacancy', is_resolved: false, event_date: daysAgo(10), amount_eur: -500 },
      { property_id: 'p1', kind: 'rent_revision', is_resolved: false, event_date: daysAgo(20), amount_eur: 800 },
      { property_id: 'p1', kind: 'exceptional_charge', is_resolved: false, event_date: daysAgo(5), amount_eur: -300 },
    ]
    expect(computeUnpaidRentAlerts(events, TODAY)).toEqual([])
  })

  it('ignore les events résolus (is_resolved=true)', () => {
    const events = [
      unpaid('p1', 45, -650, true),   // résolu → ignoré
      unpaid('p1', 10, -650, false),  // actif
    ]
    const out = computeUnpaidRentAlerts(events, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0]!.count).toBe(1)
    expect(out[0]!.daysSinceOldest).toBe(10)
  })

  it('biens sans impayé non résolu : ABSENTS du résultat (pas de slot vide)', () => {
    const events = [
      unpaid('p1', 5),
      unpaid('p2', 0, -650, true),    // résolu
    ]
    const out = computeUnpaidRentAlerts(events, TODAY)
    expect(out.map(s => s.propertyId)).toEqual(['p1'])
  })
})

// ─── Sévérité ───────────────────────────────────────────────────────────────

describe('V11 — sévérité progressive', () => {
  it('1 impayé < 30 jours : info', () => {
    const out = computeUnpaidRentAlerts([unpaid('p1', 15)], TODAY)
    expect(out[0]!.severity).toBe('info')
  })

  it('1 impayé pile à 0 jours (saisi aujourd\'hui) : info', () => {
    const out = computeUnpaidRentAlerts([unpaid('p1', 0)], TODAY)
    expect(out[0]!.severity).toBe('info')
    expect(out[0]!.daysSinceOldest).toBe(0)
  })

  it(`1 impayé pile à ${UNPAID_RENT_WARNING_DAYS} jours : warning (seuil inclus)`, () => {
    const out = computeUnpaidRentAlerts([unpaid('p1', UNPAID_RENT_WARNING_DAYS)], TODAY)
    expect(out[0]!.severity).toBe('warning')
  })

  it(`1 impayé pile à ${UNPAID_RENT_CRITICAL_DAYS} jours : warning (borne stricte critical)`, () => {
    const out = computeUnpaidRentAlerts([unpaid('p1', UNPAID_RENT_CRITICAL_DAYS)], TODAY)
    expect(out[0]!.severity).toBe('warning')
  })

  it(`1 impayé à ${UNPAID_RENT_CRITICAL_DAYS + 1} jours : critical`, () => {
    const out = computeUnpaidRentAlerts([unpaid('p1', UNPAID_RENT_CRITICAL_DAYS + 1)], TODAY)
    expect(out[0]!.severity).toBe('critical')
  })

  it('2 impayés récents (< 30 j chacun) : warning (count ≥ 2 OR clause)', () => {
    const out = computeUnpaidRentAlerts([
      unpaid('p1', 5),
      unpaid('p1', 10),
    ], TODAY)
    expect(out[0]!.severity).toBe('warning')
    expect(out[0]!.count).toBe(2)
  })

  it('3 impayés récents : critical (count ≥ 3 OR clause)', () => {
    const out = computeUnpaidRentAlerts([
      unpaid('p1', 5),
      unpaid('p1', 10),
      unpaid('p1', 15),
    ], TODAY)
    expect(out[0]!.severity).toBe('critical')
    expect(out[0]!.count).toBe(3)
  })

  it('ancienneté domine sur compte : 1 impayé > 60 j = critical malgré count=1', () => {
    const out = computeUnpaidRentAlerts([unpaid('p1', 90)], TODAY)
    expect(out[0]!.severity).toBe('critical')
    expect(out[0]!.count).toBe(1)
  })
})

// ─── Agrégation ─────────────────────────────────────────────────────────────

describe('V11 — agrégation par bien', () => {
  it('multi-biens : un summary par bien concerné', () => {
    const out = computeUnpaidRentAlerts([
      unpaid('p1', 5),
      unpaid('p2', 45),
      unpaid('p3', 90),
      unpaid('p3', 30),
    ], TODAY)

    const byId = new Map(out.map(s => [s.propertyId, s]))
    expect(out).toHaveLength(3)
    expect(byId.get('p1')!.severity).toBe('info')
    expect(byId.get('p2')!.severity).toBe('warning')
    expect(byId.get('p3')!.severity).toBe('critical')
    expect(byId.get('p3')!.count).toBe(2)
  })

  it('totalUnpaidEur : somme en POSITIF (amount_eur DB stocké négatif)', () => {
    const out = computeUnpaidRentAlerts([
      unpaid('p1', 10, -650),
      unpaid('p1', 5,  -650),
    ], TODAY)
    expect(out[0]!.totalUnpaidEur).toBe(1300)
    expect(out[0]!.totalUnpaidEur).toBeGreaterThan(0)
  })

  it('totalUnpaidEur tolère amount_eur null (event sans montant saisi)', () => {
    const out = computeUnpaidRentAlerts([
      { property_id: 'p1', kind: 'rent_unpaid', is_resolved: false, event_date: daysAgo(5), amount_eur: null },
      unpaid('p1', 10, -800),
    ], TODAY)
    expect(out[0]!.totalUnpaidEur).toBe(800)
  })

  it('totalUnpaidEur tolère un amount_eur positif (saisie incorrecte) en l\'absolutisant', () => {
    // Robustesse : si l'utilisateur saisit +650 par erreur au lieu de -650,
    // on l'absolutise quand même pour ne pas afficher une alerte vide.
    const out = computeUnpaidRentAlerts([unpaid('p1', 10, 650)], TODAY)
    expect(out[0]!.totalUnpaidEur).toBe(650)
  })

  it('oldestUnpaidDate : date du plus vieux event non résolu', () => {
    const out = computeUnpaidRentAlerts([
      unpaid('p1', 10),
      unpaid('p1', 90),
      unpaid('p1', 30),
    ], TODAY)
    expect(out[0]!.oldestUnpaidDate).toBe(daysAgo(90))
    expect(out[0]!.daysSinceOldest).toBe(90)
  })

  it('event_date dans le futur : daysSinceOldest = 0 (pas de valeur négative)', () => {
    const future = new Date(TODAY.getTime() + 5 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]!
    const out = computeUnpaidRentAlerts([
      { property_id: 'p1', kind: 'rent_unpaid', is_resolved: false, event_date: future, amount_eur: -650 },
    ], TODAY)
    expect(out[0]!.daysSinceOldest).toBe(0)
    expect(out[0]!.severity).toBe('info')
  })
})
