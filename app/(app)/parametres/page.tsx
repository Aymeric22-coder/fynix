import { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import ParametresForm from './parametres-form'

export const metadata: Metadata = { title: 'Paramètres' }

export default async function ParametresPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return (
    <div className="max-w-2xl">
      <PageHeader title="Paramètres" subtitle="Profil fiscal et préférences de l'application" />
      <ParametresForm profile={profile} userEmail={user!.email ?? ''} />
    </div>
  )
}
