import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { translateAuthError } from '@/lib/auth/errorMessages'
import { LoginBodySchema } from '@/lib/auth/authSchemas'
import { formatZodErrors } from '@/lib/portfolio/importSchema'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fynix-mu.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null)
    const parsed = LoginBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodErrors(parsed.error).join(' ; ') },
        { status: 400 },
      )
    }
    const { email, password } = parsed.data

    const supabase = await createServerClient()

    if (password) {
      // Password login
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return NextResponse.json({ error: translateAuthError(error.message) }, { status: 401 })
      return NextResponse.json({ ok: true })
    } else {
      // Magic link
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${APP_URL}/dashboard` },
      })
      if (error) return NextResponse.json({ error: translateAuthError(error.message) }, { status: 400 })
      return NextResponse.json({ ok: true, magic: true })
    }
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
