import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { translateAuthError } from '@/lib/auth/errorMessages'
import { SignupBodySchema } from '@/lib/auth/authSchemas'
import { formatZodErrors } from '@/lib/portfolio/importSchema'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fynix-mu.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = SignupBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodErrors(parsed.error).join(' ; ') },
        { status: 400 },
      )
    }
    const { email, password } = parsed.data

    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Onboarding 60s : on envoie le user fraîchement confirmé sur /bienvenue.
      // La page redirige vers /dashboard si le profil est déjà complet.
      options: { emailRedirectTo: `${APP_URL}/bienvenue` },
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
