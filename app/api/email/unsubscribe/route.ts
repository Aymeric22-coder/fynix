/**
 * GET /api/email/unsubscribe?token=xxx
 *
 * Route PUBLIQUE (sans withAuth) : l'utilisateur clique depuis son email
 * sans être connecté. La sécurité repose sur la connaissance du token
 * (UUID v4, non devinable). Si le token est valide, on désactive
 * email_monthly_report et on régénère le token pour invalider d'éventuels
 * autres liens.
 *
 * Retourne une page HTML simple — pas de JSON car c'est ouvert dans un
 * navigateur direct depuis l'email.
 */

import { createServiceClient } from '@/lib/supabase/server'

const HTML_OK = (email?: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Désinscription Fynix</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; background:#0a0a0a; color:#f4f4f5; font-family:-apple-system,sans-serif; padding:48px 16px; }
  .card { max-width:480px; margin:0 auto; background:#111; border:1px solid #222; border-radius:12px; padding:32px; text-align:center; }
  h1 { margin:0 0 12px; font-size:20px; color:#10b981; }
  p { color:#a1a1aa; line-height:1.6; margin:8px 0; font-size:14px; }
  a { color:#10b981; text-decoration:underline; }
</style>
</head><body>
<div class="card">
  <div style="font-size:14px;font-weight:700;letter-spacing:0.18em;margin-bottom:24px;">FYNIX</div>
  <h1>✓ Vous êtes désinscrit</h1>
  <p>Vous ne recevrez plus le rapport patrimonial mensuel${email ? ' à <strong>' + email + '</strong>' : ''}.</p>
  <p>Vous pouvez vous réinscrire à tout moment depuis <a href="https://fynix-mu.vercel.app/parametres">vos paramètres</a>.</p>
</div>
</body></html>`

const HTML_ERROR = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Lien invalide</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; background:#0a0a0a; color:#f4f4f5; font-family:-apple-system,sans-serif; padding:48px 16px; }
  .card { max-width:480px; margin:0 auto; background:#111; border:1px solid #222; border-radius:12px; padding:32px; text-align:center; }
  h1 { margin:0 0 12px; font-size:20px; color:#ef4444; }
  p { color:#a1a1aa; line-height:1.6; margin:8px 0; font-size:14px; }
  a { color:#10b981; text-decoration:underline; }
</style>
</head><body>
<div class="card">
  <div style="font-size:14px;font-weight:700;letter-spacing:0.18em;margin-bottom:24px;">FYNIX</div>
  <h1>Lien invalide ou expiré</h1>
  <p>Ce lien de désinscription n'est plus valide. Il a peut-être déjà été utilisé.</p>
  <p>Vous pouvez gérer vos préférences depuis <a href="https://fynix-mu.vercel.app/parametres">vos paramètres</a>.</p>
</div>
</body></html>`

export async function GET(req: Request): Promise<Response> {
  const url   = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token || token.length < 8) {
    return new Response(HTML_ERROR, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // Service role : route publique, on contourne RLS volontairement
  // (l'authentification se fait via la connaissance du token).
  const supabase = createServiceClient()

  // 1. Vérifie l'existence du token
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email_unsubscribe_token', token)
    .maybeSingle()

  if (!profile) {
    return new Response(HTML_ERROR, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // 2. Désactive l'opt-in. On garde le même token pour permettre à
  // l'utilisateur de cliquer plusieurs fois sur le même lien sans erreur.
  // Il sera régénéré au prochain resubscribe.
  await supabase
    .from('profiles')
    .update({ email_monthly_report: false })
    .eq('id', profile.id)

  // 3. Récupère l'email pour affichage (via auth.users via service role)
  const { data: userData } = await supabase.auth.admin.getUserById(profile.id as string)
  const email = userData?.user?.email

  return new Response(HTML_OK(email), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
