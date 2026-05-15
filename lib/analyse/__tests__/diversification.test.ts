import { describe, it, expect } from 'vitest'
import { diversificationScore } from '../diversification'

describe('diversificationScore', () => {
  it('1 seul bucket à 100 % → 0', () => {
    expect(diversificationScore([{ pourcentage: 100 }])).toBe(0)
  })

  it('2 buckets égaux → ~50', () => {
    const s = diversificationScore([{ pourcentage: 50 }, { pourcentage: 50 }])
    expect(s).toBe(50)
  })

  it('5 buckets égaux à 20 % → 80', () => {
    const buckets = Array.from({ length: 5 }, () => ({ pourcentage: 20 }))
    expect(diversificationScore(buckets)).toBe(80)
  })

  it('10 buckets égaux à 10 % → 90', () => {
    const buckets = Array.from({ length: 10 }, () => ({ pourcentage: 10 }))
    expect(diversificationScore(buckets)).toBe(90)
  })

  it('vide → 0', () => {
    expect(diversificationScore([])).toBe(0)
  })

  it('concentration extrême (90/10) → bas', () => {
    const s = diversificationScore([{ pourcentage: 90 }, { pourcentage: 10 }])
    // hhi = 8100 + 100 = 8200 → score = 18
    expect(s).toBe(18)
  })
})
