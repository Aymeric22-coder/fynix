import { describe, it, expect } from 'vitest'
import {
  shouldSkipSnapshot, markSnapshot, createMemoryStore,
  SNAPSHOT_DEBOUNCE_MS,
} from '../snapshotDebounce'

describe('snapshotDebounce', () => {
  it('1er appel n\'est jamais skippe', () => {
    const store = createMemoryStore()
    expect(shouldSkipSnapshot('u1', 1000, store)).toBe(false)
  })

  it('2e appel < 30 s apres → skippe', () => {
    const store = createMemoryStore()
    markSnapshot('u1', 1000, store)
    // 1000 + 29 999 ms = encore dans la fenetre
    expect(shouldSkipSnapshot('u1', 1000 + 29_999, store)).toBe(true)
  })

  it('2e appel >= 30 s apres → non skippe', () => {
    const store = createMemoryStore()
    markSnapshot('u1', 1000, store)
    expect(shouldSkipSnapshot('u1', 1000 + SNAPSHOT_DEBOUNCE_MS, store)).toBe(false)
    expect(shouldSkipSnapshot('u1', 1000 + 60_000, store)).toBe(false)
  })

  it('debounce isole entre utilisateurs', () => {
    const store = createMemoryStore()
    markSnapshot('u1', 1000, store)
    expect(shouldSkipSnapshot('u1', 1500, store)).toBe(true)
    expect(shouldSkipSnapshot('u2', 1500, store)).toBe(false)
  })

  it('debounceMs override permet de tester avec une fenetre courte', () => {
    const store = createMemoryStore()
    markSnapshot('u1', 1000, store)
    expect(shouldSkipSnapshot('u1', 1100, store, 50)).toBe(false)
    expect(shouldSkipSnapshot('u1', 1010, store, 50)).toBe(true)
  })
})
