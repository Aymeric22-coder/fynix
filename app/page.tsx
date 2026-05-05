import { redirect } from 'next/navigation'

// La page racine redirige toujours.
// Le middleware gère l'auth — si non connecté → /login, si connecté → /dashboard.
export default function RootPage() {
  redirect('/dashboard')
}
