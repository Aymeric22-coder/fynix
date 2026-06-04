/**
 * Tests du helper `lib/cash/freshness.ts` (V1.4 Vol D).
 */
import { describe, it, expect } from 'vitest'
import { getFreshnessLevel, getBalanceDateAgeDays } from '../freshness'

const NOW = new Date('2026-06-04T12:00:00Z')

describe('getFreshnessLevel — paliers 90/180 jours', () => {
  it('aujourd\'hui → none', () => {
    expect(getFreshnessLevel('2026-06-04', NOW)).toBe('none')
  })

  it('il y a 30 jours → none', () => {
    expect(getFreshnessLevel('2026-05-05', NOW)).toBe('none')
  })

  it('il y a 89 jours → none (juste sous le seuil)', () => {
    const date = new Date(NOW.getTime() - 89 * 86_400_000).toISOString().slice(0, 10)
    expect(getFreshnessLevel(date, NOW)).toBe('none')
  })

  it('il y a 100 jours → warning', () => {
    const date = new Date(NOW.getTime() - 100 * 86_400_000).toISOString().slice(0, 10)
    expect(getFreshnessLevel(date, NOW)).toBe('warning')
  })

  it('il y a 179 jours → warning (juste sous le seuil stale)', () => {
    const date = new Date(NOW.getTime() - 179 * 86_400_000).toISOString().slice(0, 10)
    expect(getFreshnessLevel(date, NOW)).toBe('warning')
  })

  it('il y a 200 jours → stale', () => {
    const date = new Date(NOW.getTime() - 200 * 86_400_000).toISOString().slice(0, 10)
    expect(getFreshnessLevel(date, NOW)).toBe('stale')
  })

  it('balance_date null → none (saisie initiale légitime)', () => {
    expect(getFreshnessLevel(null, NOW)).toBe('none')
  })

  it('balance_date invalide → none (défensif)', () => {
    expect(getFreshnessLevel('pas-une-date', NOW)).toBe('none')
  })
})

describe('getBalanceDateAgeDays', () => {
  it('aujourd\'hui → 0', () => {
    expect(getBalanceDateAgeDays('2026-06-04', NOW)).toBe(0)
  })

  it('il y a 90 jours → 90', () => {
    const date = new Date(NOW.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
    expect(getBalanceDateAgeDays(date, NOW)).toBe(90)
  })

  it('null → 0', () => {
    expect(getBalanceDateAgeDays(null, NOW)).toBe(0)
  })
})
