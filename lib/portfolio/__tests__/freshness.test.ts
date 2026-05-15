import { describe, it, expect } from 'vitest'
import {
  freshThresholdMs, isPriceFresh, defaultFrequencyForClass,
} from '../freshness'

const DAY = 24 * 60 * 60 * 1000

describe('freshThresholdMs', () => {
  it('renvoie ~36h pour daily', () => {
    expect(freshThresholdMs('daily')).toBe(1.5 * DAY)
  })

  it('renvoie 9j pour weekly', () => {
    expect(freshThresholdMs('weekly')).toBe(9 * DAY)
  })

  it('renvoie 35j pour monthly', () => {
    expect(freshThresholdMs('monthly')).toBe(35 * DAY)
  })

  it('renvoie ~3 mois pour quarterly', () => {
    expect(freshThresholdMs('quarterly')).toBe(100 * DAY)
  })

  it('renvoie Infinity pour manual (jamais stale)', () => {
    expect(freshThresholdMs('manual')).toBe(Number.POSITIVE_INFINITY)
  })

  it('fallback daily pour null / undefined (legacy rows)', () => {
    expect(freshThresholdMs(null)).toBe(1.5 * DAY)
    expect(freshThresholdMs(undefined)).toBe(1.5 * DAY)
  })
})

describe('isPriceFresh', () => {
  const now = new Date('2026-06-15T12:00:00Z')

  it('prix de la veille reste frais pour daily (< 36h)', () => {
    const yesterday = new Date('2026-06-14T18:00:00Z').toISOString()
    expect(isPriceFresh(yesterday, 'daily', now)).toBe(true)
  })

  it('prix vieux de 2 jours est stale pour daily', () => {
    const old = new Date('2026-06-13T00:00:00Z').toISOString()
    expect(isPriceFresh(old, 'daily', now)).toBe(false)
  })

  it('prix vieux de 30 jours reste frais pour monthly', () => {
    const oneMonthAgo = new Date('2026-05-16T12:00:00Z').toISOString()
    expect(isPriceFresh(oneMonthAgo, 'monthly', now)).toBe(true)
  })

  it('prix vieux de 80 jours reste frais pour quarterly', () => {
    const twoMonthsAgo = new Date('2026-03-27T12:00:00Z').toISOString()
    expect(isPriceFresh(twoMonthsAgo, 'quarterly', now)).toBe(true)
  })

  it('manual : un prix vieux de plusieurs annees reste frais', () => {
    const veryOld = new Date('2020-01-01T12:00:00Z').toISOString()
    expect(isPriceFresh(veryOld, 'manual', now)).toBe(true)
  })
})

describe('defaultFrequencyForClass', () => {
  it('etf / equity / crypto / metal / bond → daily', () => {
    expect(defaultFrequencyForClass('etf')).toBe('daily')
    expect(defaultFrequencyForClass('equity')).toBe('daily')
    expect(defaultFrequencyForClass('crypto')).toBe('daily')
    expect(defaultFrequencyForClass('metal')).toBe('daily')
    expect(defaultFrequencyForClass('bond')).toBe('daily')
  })

  it('fund / opci → monthly', () => {
    expect(defaultFrequencyForClass('fund')).toBe('monthly')
    expect(defaultFrequencyForClass('opci')).toBe('monthly')
  })

  it('scpi → quarterly', () => {
    expect(defaultFrequencyForClass('scpi')).toBe('quarterly')
  })

  it('private_equity / crowdfunding / private_debt / structured → manual', () => {
    expect(defaultFrequencyForClass('private_equity')).toBe('manual')
    expect(defaultFrequencyForClass('crowdfunding')).toBe('manual')
    expect(defaultFrequencyForClass('private_debt')).toBe('manual')
    expect(defaultFrequencyForClass('structured')).toBe('manual')
  })
})
