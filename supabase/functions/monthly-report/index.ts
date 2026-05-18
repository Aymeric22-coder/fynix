/**
 * Edge Function : monthly-report
 *
 * Déclenchée le 1er de chaque mois à 08:00 (heure de Paris ≈ 07:00 UTC en
 * hiver / 06:00 UTC en été — on prend 07:00 UTC comme compromis).
 *
 * Cette fonction se contente d'appeler l'API Next.js
 * POST /api/email/monthly-report avec le header CRON_SECRET. Toute la
 * logique métier (sélection des utilisateurs, génération du HTML, envoi
 * Resend, logs) reste côté Vercel — l'Edge Function n'est qu'un trigger.
 *
 * Pourquoi cette séparation :
 *   - L'aggregateur FIRECORE vit côté Next.js (imports lourds, types TS)
 *   - L'Edge Function aurait dû dupliquer toute la logique en Deno
 *   - Mieux : appeler l'API Next.js qui sait déjà tout faire
 *
 * Configuration (Supabase Dashboard → Edge Functions → Schedule) :
 *   cron: "0 7 1 * *"   # le 1er du mois à 07:00 UTC
 *
 * Variables d'env requises (Supabase Edge Functions → Settings → Secrets) :
 *   APP_URL      : URL de l'app Vercel (ex: https://fynix-mu.vercel.app)
 *   CRON_SECRET  : secret partagé avec /api/email/monthly-report (Vercel)
 */

const APP_URL     = Deno.env.get('APP_URL')     ?? 'https://fynix-mu.vercel.app'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

Deno.serve(async () => {
  if (!CRON_SECRET) {
    console.error('[monthly-report-cron] CRON_SECRET not configured')
    return new Response(
      JSON.stringify({ ok: false, error: 'CRON_SECRET not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const url = `${APP_URL}/api/email/monthly-report`
    console.log(`[monthly-report-cron] Calling ${url}`)

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    })

    const body = await res.json().catch(() => ({ error: 'invalid JSON response' }))
    console.log(`[monthly-report-cron] HTTP ${res.status} — `, JSON.stringify(body))

    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status, body }),
      { status: res.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[monthly-report-cron] Fatal error:', message)
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
