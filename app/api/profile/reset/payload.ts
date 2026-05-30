/**
 * Payload de wipe pour POST /api/profile/reset.
 *
 * Extrait dans un fichier séparé car Next.js 15 interdit les exports
 * « non-standard » depuis un `route.ts` (seuls les handlers HTTP et
 * quelques exports de config — `dynamic`, `revalidate`, etc. — sont
 * autorisés). Garder le payload ici permet aussi de l'importer dans les
 * tests sans monter la route.
 *
 * Tous les champs sont écrits explicitement (pas de DEFAULT DB) pour rester
 * lisible et indépendant des évolutions de schéma.
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
 *
 * Sont PRÉSERVÉS (absents du payload donc non touchés par l'UPDATE) :
 *   - `id`, `display_name`, `reference_currency`, `email_monthly_report`,
 *     `email_unsubscribe_token`, `last_monthly_report_sent_at`,
 *     `created_at`, `updated_at`.
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
