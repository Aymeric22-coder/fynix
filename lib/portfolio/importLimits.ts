/**
 * Limites surface d'attaque CSV (Sprint 2 — D14).
 *
 * Extrait dans un fichier dedie car Next.js 15 interdit les exports non
 * reserves depuis les Route Handlers (`app/api/.../route.ts`). Les tests
 * d'integration et la route handler les importent depuis ici.
 */

/** Taille max du CSV en octets (5 Mo). */
export const MAX_CSV_BYTES = 5 * 1024 * 1024

/** Nombre max de lignes brutes du CSV avant rejet 422. */
export const MAX_CSV_LINES = 5000
