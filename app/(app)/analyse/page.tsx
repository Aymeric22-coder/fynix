import type { Metadata } from 'next'
import { AnalyseClient } from './analyse-client'

export const metadata: Metadata = { title: 'Analyse patrimoniale' }

/**
 * Page /analyse — wrapper Server Component.
 *
 * Le client gère le chargement (hook + cache 5 min côté browser) ainsi
 * que le bouton "Actualiser les prix" qui invalide le cache ISIN serveur.
 */
export default function AnalysePage() {
  return <AnalyseClient />
}
