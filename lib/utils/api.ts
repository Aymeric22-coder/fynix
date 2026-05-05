import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

// ─── Response helpers ─────────────────────────────────────────────────────────

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data, error: null }, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ data: null, error: message }, { status })
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

// Le contexte Next.js contient `params` pour les routes dynamiques
export type RouteContext = { params: Promise<Record<string, string>> }

type RouteHandler<Ctx = RouteContext> = (
  req: Request,
  user: User,
  ctx: Ctx,
) => Promise<NextResponse>

/**
 * HOF d'authentification — enveloppe un handler Route Handler App Router.
 * Injecte l'utilisateur authentifié ET transmet le contexte de route (params).
 */
export function withAuth<Ctx = RouteContext>(handler: RouteHandler<Ctx>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const supabase = await createServerClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) return err('Unauthorized', 401)

      return await handler(req, user, ctx)
    } catch (e) {
      console.error('[fynix] Unhandled error:', e)
      return err('Internal server error', 500)
    }
  }
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

export function getPagination(url: string) {
  const { searchParams } = new URL(url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { from, to, limit, page }
}

// ─── Parse & validate JSON body ───────────────────────────────────────────────

export async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}
