import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { translateAuthError } from '@/lib/auth/errorMessages'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fynix-mu.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Mot de passe trop court (minimum 6 caracteres).' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${APP_URL}/dashboard` },
    })

    if (error) {
      return NextResponse.json({ error: translateAuthError(error.message) }, { status: 400 })
    }

    // Si Supabase exige la confirmation email, data.session sera null.
    const needsConfirmation = !data.session
    return NextResponse.json({ ok: true, needsConfirmation })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
