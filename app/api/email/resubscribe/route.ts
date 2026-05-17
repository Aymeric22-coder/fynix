/**
 * POST /api/email/resubscribe — réactive l'opt-in mensuel
 *
 * Réactive email_monthly_report=true ET régénère un nouveau
 * email_unsubscribe_token pour invalider les anciens liens.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

export const POST = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  // Régénère un token UUID v4 côté JS (postgres gen_random_uuid en SQL serait
  // plus propre mais nécessite une RPC — on garde simple ici).
  const newToken = crypto.randomUUID()

  const { data, error } = await supabase
    .from('profiles')
    .update({
      email_monthly_report:    true,
      email_unsubscribe_token: newToken,
    })
    .eq('id', user.id)
    .select('email_monthly_report')
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})
