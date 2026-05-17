/**
 * Edge Function : snapshot-daily — DEPRECIE (Sprint 2, I4 finalise).
 *
 * Cette fonction ecrivait dans `patrimony_snapshots` chaque nuit (cron
 * Supabase). La table est supprimee en migration 027. Le nouveau flux
 * de snapshot patrimonial est :
 *
 *   - Visite de /analyse → POST /api/analyse/snapshot (fire-and-forget
 *     cote client, anti-rebond 30 s, ecrit dans wealth_snapshots).
 *   - Pour les utilisateurs inactifs, /api/cron/refresh-prices declenche
 *     aussi `persistPortfolioSnapshot` quotidiennement (cron Vercel a 08:00).
 *
 * Cette function retourne 410 Gone si appelee. Le cron Supabase associe
 * doit etre desactive dans le dashboard :
 *
 *   SELECT cron.unschedule('snapshot-daily-cron');
 *
 * Le code original est archive dans l'historique git si necessaire.
 */

Deno.serve(() => {
  return new Response(
    JSON.stringify({
      deprecated:    true,
      message:       'snapshot-daily est déprécié depuis Sprint 2. Désactivez le cron Supabase.',
      replaced_by:   'POST /api/analyse/snapshot (côté Next.js, anti-rebond 30 s)',
    }),
    {
      status:  410,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
