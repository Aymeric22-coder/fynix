/**
 * Helpers de log dev-only : silencieux en production (Vercel / NODE_ENV=production).
 *
 * Permet de garder des traces utiles en local et dans `next dev` sans
 * polluer les logs Vercel (qui sont indexes et factures au volume).
 *
 * En production l'argument peut etre une fonction pour eviter de calculer
 * la chaine de format si elle n'est pas utilisee (rare ici, mais propre).
 */
const isDev = process.env.NODE_ENV !== 'production'

export function devLog(...args: unknown[]): void {
  if (isDev) console.log(...args)
}

export function devWarn(...args: unknown[]): void {
  if (isDev) console.warn(...args)
}
