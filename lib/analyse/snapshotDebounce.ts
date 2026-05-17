/**
 * Anti-rebond des snapshots patrimoine.
 *
 * Sprint 1 — B8 : usePatrimoineAnalyse fait un fire-and-forget POST
 * /api/analyse/snapshot apres chaque load + chaque event Realtime.
 * Avant : chaque event re-declenchait getPatrimoineComplet cote serveur
 * (2-5 s) pour potentiellement ecrire le MEME snapshot du jour.
 * Apres : on debounce 30 s par user en memoire serveur.
 *
 * Le store est juste une Map injectable pour permettre les tests. En prod,
 * la route utilise un module-scoped Map (un par instance serverless, ce
 * qui est largement suffisant : meme si plusieurs instances coexistent, le
 * pire cas est un doublon par instance toutes les 30 s = negligeable).
 */

export const SNAPSHOT_DEBOUNCE_MS = 30_000

export interface SnapshotDebounceStore {
  get: (userId: string) => number | undefined
  set: (userId: string, ts: number) => void
}

/** Renvoie true si un snapshot a deja ete enregistre pour ce user
 *  il y a moins de `debounceMs` ms. */
export function shouldSkipSnapshot(
  userId:    string,
  now:       number,
  store:     SnapshotDebounceStore,
  debounceMs: number = SNAPSHOT_DEBOUNCE_MS,
): boolean {
  const last = store.get(userId)
  if (last === undefined) return false
  return now - last < debounceMs
}

/** Enregistre le timestamp du dernier snapshot. */
export function markSnapshot(
  userId: string,
  now:    number,
  store:  SnapshotDebounceStore,
): void {
  store.set(userId, now)
}

/** Helper pour creer un store base sur Map. */
export function createMemoryStore(): SnapshotDebounceStore {
  const m = new Map<string, number>()
  return {
    get: (k) => m.get(k),
    set: (k, v) => { m.set(k, v) },
  }
}
