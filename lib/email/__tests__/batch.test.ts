import { describe, it, expect, vi } from 'vitest'
import { runInBatches } from '../batch'

describe('runInBatches', () => {
  it('25 items, batchSize 10 → 3 batches (10+10+5) avec délais entre', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i)
    const sleepCalls: number[] = []
    const fakeSleep = (ms: number) => {
      sleepCalls.push(ms)
      return Promise.resolve()
    }
    const fn = vi.fn(async (n: number) => n * 2)

    const onBatch = vi.fn()
    const summary = await runInBatches(items, fn, {
      batchSize: 10, delayMs: 100, sleep: fakeSleep, onBatch,
    })

    expect(summary.total).toBe(25)
    expect(summary.succeeded).toBe(25)
    expect(summary.failed).toBe(0)
    // 3 batches → 2 délais entre (pas après le dernier)
    expect(sleepCalls).toEqual([100, 100])
    expect(onBatch).toHaveBeenCalledTimes(3)
    expect(onBatch).toHaveBeenNthCalledWith(1, 1, 3, 10, 0)
    expect(onBatch).toHaveBeenNthCalledWith(2, 2, 3, 10, 0)
    expect(onBatch).toHaveBeenNthCalledWith(3, 3, 3, 5, 0)
    expect(fn).toHaveBeenCalledTimes(25)
    // Premier item mappé correctement
    expect(summary.results[0]).toEqual({ item: 0, ok: true, value: 0 })
    expect(summary.results[24]).toEqual({ item: 24, ok: true, value: 48 })
  })

  it('un échec dans un batch n\'interrompt pas les suivants', async () => {
    const fakeSleep = () => Promise.resolve()
    const fn = vi.fn(async (n: number) => {
      if (n === 3) throw new Error('boom')
      return n
    })
    const summary = await runInBatches([1, 2, 3, 4, 5], fn, {
      batchSize: 2, delayMs: 0, sleep: fakeSleep,
    })

    expect(summary.succeeded).toBe(4)
    expect(summary.failed).toBe(1)
    const failure = summary.results.find((r) => !r.ok)
    expect(failure).toMatchObject({ item: 3, ok: false, error: 'boom' })
    expect(fn).toHaveBeenCalledTimes(5)
  })

  it('liste vide ne fait aucun sleep ni aucun appel', async () => {
    const sleepCalls: number[] = []
    const fn = vi.fn(async (x: number) => x)
    const summary = await runInBatches([], fn, {
      batchSize: 10, delayMs: 100,
      sleep: (ms) => { sleepCalls.push(ms); return Promise.resolve() },
    })
    expect(summary).toEqual({ total: 0, succeeded: 0, failed: 0, results: [] })
    expect(sleepCalls).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('respecte le batchSize 1 (sequentiel) avec sleeps entre chaque', async () => {
    const sleepCalls: number[] = []
    const fakeSleep = (ms: number) => { sleepCalls.push(ms); return Promise.resolve() }
    const fn = vi.fn(async (n: number) => n)

    const summary = await runInBatches([1, 2, 3], fn, {
      batchSize: 1, delayMs: 50, sleep: fakeSleep,
    })
    expect(summary.succeeded).toBe(3)
    // 3 batches → 2 délais
    expect(sleepCalls).toEqual([50, 50])
  })

  // Sprint 2 — D19 : config OpenFIGI cote import (5 ISINs / 2.5 s).
  it('12 items / batchSize 5 / delayMs 2500 → 3 batches (5/5/2) + 2 sleeps', async () => {
    const items = Array.from({ length: 12 }, (_, i) => `ISIN-${i}`)
    const onBatch = vi.fn()
    const sleeps: number[] = []
    const summary = await runInBatches(items, async (i) => i, {
      batchSize: 5, delayMs: 2500,
      sleep: (ms) => { sleeps.push(ms); return Promise.resolve() },
      onBatch,
    })
    expect(summary.succeeded).toBe(12)
    expect(onBatch).toHaveBeenCalledTimes(3)
    expect(onBatch).toHaveBeenNthCalledWith(1, 1, 3, 5, 0)
    expect(onBatch).toHaveBeenNthCalledWith(2, 2, 3, 5, 0)
    expect(onBatch).toHaveBeenNthCalledWith(3, 3, 3, 2, 0)
    expect(sleeps).toEqual([2500, 2500])
  })
})
