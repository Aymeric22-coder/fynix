import type { Metadata } from 'next'
import { ProfilClient } from './profil-client'

export const metadata: Metadata = { title: 'Profil investisseur' }

/**
 * Page /profil — wrapper Server Component.
 *
 * Toute la logique (chargement profil, état questionnaire vs carte) vit
 * dans ProfilClient. La page Server existe pour fixer la metadata et
 * garder la possibilité d'ajouter du SSR data-fetching plus tard si
 * besoin (KPIs précalculés, snapshot quotidien, etc.).
 */
export default function ProfilPage() {
  return <ProfilClient />
}
