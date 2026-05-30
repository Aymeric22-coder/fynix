/**
 * POST /api/profile/reset
 *
 * Outil dev/debug : remet à zéro toutes les réponses du wizard ET de
 * l'onboarding 60s pour que l'utilisateur puisse les revivre depuis le
 * début. Ne touche QUE la table `profiles` — aucune autre table (positions,
 * biens, comptes, snapshots…) n'est impactée.
 *
 * Sont WIPÉS :
 *   - Toutes les colonnes saisies par le wizard (Step 1 à 9), miroir de
 *     la whitelist PUT/PATCH de /api/profile.
 *   - Les sentinelles `wizard_step_completed` (→ 0) et `profile_completed_at`
 *     (→ null).
 *   - Les colonnes saisies par l'onboarding 60s : `onboarding_quick_done`
 *     (→ false), `onboarding_quick_data` (→ null).
 *   - Les colonnes legacy conservées en DB mais retirées de l'UI
 *     (`invest_mensuel` retiré en QW1, `fiscal_situation` /
 *     `professional_income_eur` / `foyer_fiscal_parts` retirés en CS1).
 *     Cohérent avec « remettre le profil à l'état post-création ».
 *
 * Sont PRÉSERVÉS :
 *   - `id` (clé primaire)
 *   - `display_name` (préférence utilisateur)
 *   - `reference_currency` (préférence)
 *   - `email_monthly_report` + `email_unsubscribe_token` (le user a pris une
 *     décision dessus, on ne la touche pas)
 *   - `last_monthly_report_sent_at` (historique)
 *   - `created_at`, `updated_at` (timestamps DB ; updated_at sera bumpé
 *     automatiquement par le trigger `fn_update_updated_at`)
 *
 * RLS : la table `profiles` filtre par `id = auth.uid()`. La route applique
 * `eq('id', user.id)` en ceinture-bretelles.
 */
import { createServerClient } from '@/lib/supabase/server'
import { err, ok, withAuth } from '@/lib/utils/api'

/**
 * Payload de wipe. Exporté pour pouvoir le tester sans monter la route.
 *
 * Tous les champs sont écrits explicitement (pas de DEFAULT DB) pour rester
 * lisible et indépendant des évolutions de schéma.
 */
export const RESET_WIPE_PAYLOAD = {
  // ── Wizard Step 1 ───────────────────────────────────────────────────
  prenom:              null,
  age:                 null,
  situation_familiale: null,
  enfants:             null,
  statut_pro:          null,
  // ── Wizard Step 2 ───────────────────────────────────────────────────
  revenu_mensuel:      null,
  revenu_conjoint:     null,
  autres_revenus:      null,
  stabilite_revenus:   null,
  // ── Wizard Step 3 ───────────────────────────────────────────────────
  loyer:               null,
  autres_credits:      null,
  charges_fixes:       null,
  depenses_courantes:  null,
  // ── Wizard Step 4 ───────────────────────────────────────────────────
  epargne_mensuelle:   null,
  enveloppes:          [],
  // ── Legacy QW1 (UI retirée, colonne DB conservée) ────────────────────
  invest_mensuel:      null,
  // ── Wizard Step 5/6/7 ───────────────────────────────────────────────
  quiz_bourse:                 [],
  quiz_crypto:                 [],
  quiz_immo:                   [],
  quiz_self_declared_domains:  [],
  // ── Wizard Step 8 ───────────────────────────────────────────────────
  risk_1:              null,
  risk_2:              null,
  risk_3:              null,
  risk_4:              null,
  fire_type:           null,
  revenu_passif_cible: null,
  age_cible:           null,
  priorite:            null,
  // ── Wizard Step 9 (CS1) ─────────────────────────────────────────────
  tmi_rate:            null,
  // ── Legacy /parametres CS1 (UI retirée, colonne DB conservée) ───────
  fiscal_situation:        null,
  professional_income_eur: 0,         // ramené au défaut DB
  foyer_fiscal_parts:      1.0,       // ramené au défaut DB
  // ── Sentinelles wizard ──────────────────────────────────────────────
  wizard_step_completed: 0,
  profile_completed_at:  null,
  // ── Onboarding 60s ─────────────────────────────────────────────────
  onboarding_quick_done: false,
  onboarding_quick_data: null,
} as const

export const POST = withAuth(async (_req, user) => {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('profiles')
    .update(RESET_WIPE_PAYLOAD)
    .eq('id', user.id)

  if (error) return err(`Erreur Supabase : ${error.message}`, 500)

  return ok({ ok: true, redirect: '/bienvenue' })
})
