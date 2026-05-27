/**
 * POST /api/email/monthly-report
 *
 * Génère et envoie le rapport patrimonial mensuel. Deux modes d'appel :
 *
 *   1. CRON (Edge Function ou cron externe) :
 *      Header `Authorization: Bearer <CRON_SECRET>`
 *      → traite TOUS les utilisateurs avec email_monthly_report=true
 *        dont last_monthly_report_sent_at < début du mois courant.
 *
 *   2. Manuel (utilisateur connecté, bouton "Rapport test maintenant") :
 *      Auth Supabase classique (cookie)
 *      → traite UNIQUEMENT l'utilisateur connecté, même si déjà envoyé
 *        ce mois (utile pour tester le rendu).
 *
 * Garantie : un échec d'envoi pour un user N ne bloque pas le traitement
 * du user N+1. Chaque tentative est loggée dans email_logs avec
 * success=true|false + error_message.
 */

import { createServiceClient, createServerClient } from '@/lib/supabase/server'
import { ok, err } from '@/lib/utils/api'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'
import { genererActionsMensuelles } from '@/lib/analyse/recoMensuelles'
import { calculerOpportunitesFiscales } from '@/lib/analyse/optimiseurFiscal'
import { sendEmail } from '@/lib/email/sendEmail'
import { runInBatches } from '@/lib/email/batch'
import {
  generateMonthlyReportHTML,
  type MonthlyReportData,
} from '@/lib/email/templates/monthly-report'
import type { PatrimoineComplet } from '@/types/analyse'
import type { SupabaseClient } from '@supabase/supabase-js'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fynix-mu.vercel.app'

interface ReportResultDetail {
  user_id: string
  success: boolean
  error?:  string
}

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // ── Mode CRON : header Bearer matche CRON_SECRET ──────────────
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return await processAllUsers()
  }

  // ── Mode MANUEL : authentification utilisateur Supabase ───────
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return err('Unauthorized', 401)
    const result = await processOneUser(user.id, { force: true })
    return ok(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[monthly-report] Unhandled:', message)
    return err(message, 500)
  }
}

// ─────────────────────────────────────────────────────────────────
// Mode CRON — tous les utilisateurs éligibles
// ─────────────────────────────────────────────────────────────────

async function processAllUsers(): Promise<Response> {
  const supabase = createServiceClient()

  // Début du mois courant en UTC
  const now = new Date()
  const debutMois = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, last_monthly_report_sent_at')
    .eq('email_monthly_report', true)

  if (pErr) {
    console.error('[monthly-report] Profile lookup failed:', pErr.message)
    return err(pErr.message, 500)
  }

  const eligibles = (profiles ?? []).filter((p) =>
    !p.last_monthly_report_sent_at
    || new Date(p.last_monthly_report_sent_at as string).toISOString() < debutMois,
  )

  console.log(`[monthly-report] ${eligibles.length} user(s) eligibles sur ${profiles?.length ?? 0} total`)

  // Sprint 1 — B7 : batching parallèle pour tenir dans le budget Edge Function.
  // 10 users en parallèle × 100 ms de pause = ~100 users/s en regime de croisière,
  // largement sous le quota Resend (100 req/s).
  const summary = await runInBatches(
    eligibles.map((p) => p.id as string),
    (userId) => processOneUser(userId, { force: false }),
    { batchSize: 10, delayMs: 100 },
  )

  const details: ReportResultDetail[] = summary.results.map((r) =>
    r.ok
      ? r.value
      : { user_id: r.item, success: false, error: r.error },
  )
  const failedIds = details.filter((d) => !d.success).map((d) => d.user_id)

  return ok({
    total:     summary.total,
    success:   summary.succeeded,
    failed:    summary.failed,
    failedIds,
    details,
  })
}

// ─────────────────────────────────────────────────────────────────
// Traitement d'un utilisateur (CRON ou manuel)
// ─────────────────────────────────────────────────────────────────

async function processOneUser(
  userId: string,
  opts: { force: boolean },
): Promise<ReportResultDetail> {
  const supabase = createServiceClient()

  // 1. Récupère l'email depuis auth.users (via service role)
  const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(userId)
  if (uErr || !userData?.user?.email) {
    return await logAndReturn(supabase, userId, false, 'Email utilisateur introuvable')
  }
  const email = userData.user.email

  // 2. Vérifie l'opt-in (sauf en mode force, ex bouton "test maintenant")
  const { data: profile } = await supabase
    .from('profiles')
    .select('email_monthly_report, email_unsubscribe_token, prenom')
    .eq('id', userId)
    .single()
  if (!profile) {
    return await logAndReturn(supabase, userId, false, 'Profil introuvable')
  }
  if (!opts.force && !profile.email_monthly_report) {
    return await logAndReturn(supabase, userId, false, 'Opt-in désactivé')
  }

  // 3. Charge le patrimoine complet
  let patrimoine: PatrimoineComplet
  try {
    patrimoine = await getPatrimoineComplet(userId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return await logAndReturn(supabase, userId, false, `getPatrimoineComplet failed: ${message}`)
  }

  // 4. Construit les données du rapport
  const reportData = await buildReportData(supabase, userId, patrimoine, {
    prenom:             (profile.prenom as string | null) ?? '',
    unsubscribeToken:   profile.email_unsubscribe_token as string,
  })

  const html    = generateMonthlyReportHTML(reportData)
  const subject = `📊 Votre rapport patrimonial — ${reportData.mois_annee}`

  // 5. Envoie via Resend
  const sendResult = await sendEmail({ to: email, subject, html })

  // 6. Log + mise à jour last_monthly_report_sent_at si succès
  if (sendResult.success) {
    await supabase
      .from('profiles')
      .update({ last_monthly_report_sent_at: new Date().toISOString() })
      .eq('id', userId)
  }

  await supabase.from('email_logs').insert({
    user_id:       userId,
    email_type:    'monthly_report',
    success:       sendResult.success,
    error_message: sendResult.error ?? null,
    message_id:    sendResult.messageId ?? null,
  })

  return {
    user_id: userId,
    success: sendResult.success,
    ...(sendResult.error ? { error: sendResult.error } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────
// Construction des données du rapport
// ─────────────────────────────────────────────────────────────────

async function buildReportData(
  supabase:    SupabaseClient,
  userId:      string,
  patrimoine:  PatrimoineComplet,
  meta:        { prenom: string; unsubscribeToken: string },
): Promise<MonthlyReportData> {
  // Mois courant en libellé français ("Mai 2026")
  const now = new Date()
  const moisAnnee = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const moisAnneeCapitalized = moisAnnee.charAt(0).toUpperCase() + moisAnnee.slice(1)

  // ── Snapshot du mois précédent pour l'évolution ───────────────
  // On cherche le snapshot le plus proche d'il y a 30 jours.
  const ilyA30J = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: snapshots } = await supabase
    .from('wealth_snapshots')
    .select('patrimoine_net, snapshot_date')
    .eq('user_id', userId)
    .lte('snapshot_date', ilyA30J)
    .order('snapshot_date', { ascending: false })
    .limit(1)

  const patrimoineNetMoisPrec = snapshots?.[0]?.patrimoine_net ?? patrimoine.totalNet
  const evolutionEur = patrimoine.totalNet - Number(patrimoineNetMoisPrec)
  const evolutionPct = patrimoineNetMoisPrec > 0
    ? (evolutionEur / Number(patrimoineNetMoisPrec)) * 100
    : 0

  // ── Progression FIRE ──────────────────────────────────────────
  const projSnap = patrimoine.projectionFIRESnapshot
  const cibleFire = projSnap?.patrimoine_fire_cible ?? 0
  const progressionFirePct = cibleFire > 0
    ? Math.min(100, (patrimoine.totalNet / cibleFire) * 100)
    : 0

  // ── 3 actions du mois (réutilise recoMensuelles) ──────────────
  // On a besoin de la date de la position la plus récente pour la règle DCA.
  const { data: lastPos } = await supabase
    .from('positions')
    .select('acquisition_date')
    .eq('user_id', userId)
    .not('acquisition_date', 'is', null)
    .order('acquisition_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Sprint 1 — I3 : on enrichit les actions du mois avec les top opportunites
  // fiscales pour que les emails et le dashboard restent coherents.
  const opportunitesFiscales = calculerOpportunitesFiscales({ patrimoine }).opportunites
  const actions = genererActionsMensuelles(patrimoine, {
    lastPositionAddedAt: lastPos?.acquisition_date ?? null,
    opportunitesFiscales,
  }).slice(0, 3).map((a) => ({ titre: a.titre, detail: a.description }))

  // ── Répartition (top 6 classes) ───────────────────────────────
  const repartition = patrimoine.repartitionClasses
    .filter((c) => c.valeur > 0)
    .slice(0, 6)
    .map((c) => ({
      label:  c.label,
      pct:    c.pourcentage,
      valeur: c.valeur,
      color:  c.color,
    }))

  // ── Meilleure performance du mois (1ère position avec gain > 0) ─
  // Approximation : on prend la position avec le plus gros gain_loss_pct.
  const meilleurePos = [...patrimoine.positions]
    .filter((p) => p.gain_loss_pct > 0)
    .sort((a, b) => b.gain_loss_pct - a.gain_loss_pct)[0]
  const meilleurePerf = meilleurePos
    ? { nom: meilleurePos.name, gain_pct: meilleurePos.gain_loss_pct }
    : null

  return {
    prenom:                        meta.prenom || 'investisseur',
    mois_annee:                    moisAnneeCapitalized,
    patrimoine_net:                Math.round(patrimoine.totalNet),
    patrimoine_net_mois_precedent: Math.round(Number(patrimoineNetMoisPrec)),
    evolution_mois_eur:            Math.round(evolutionEur),
    evolution_mois_pct:            Math.round(evolutionPct * 100) / 100,
    progression_fire_pct:          Math.round(progressionFirePct * 10) / 10,
    age_fire_projete_median:       projSnap?.age_fire_median ?? projSnap?.age_fire_projete ?? 0,
    age_fire_cible:                patrimoine.fireInputs.age_cible ?? 0,
    revenu_passif_actuel:          Math.round(patrimoine.revenuPassifActuel),
    // QW9 — Cible AJUSTÉE composition foyer (cohérence avec patrimoine_fire_cible).
    revenu_passif_cible:           Math.round(patrimoine.fireInputs.revenu_passif_cible_ajuste),
    actions_du_mois:               actions,
    repartition,
    meilleure_performance:         meilleurePerf,
    url_app:                       APP_URL,
    url_desinscription:            `${APP_URL}/api/email/unsubscribe?token=${meta.unsubscribeToken}`,
  }
}

// ─────────────────────────────────────────────────────────────────
// Logging helper
// ─────────────────────────────────────────────────────────────────

async function logAndReturn(
  supabase: SupabaseClient,
  userId:   string,
  success:  boolean,
  error?:   string,
): Promise<ReportResultDetail> {
  await supabase.from('email_logs').insert({
    user_id:       userId,
    email_type:    'monthly_report',
    success,
    error_message: error ?? null,
  })
  return { user_id: userId, success, ...(error ? { error } : {}) }
}
