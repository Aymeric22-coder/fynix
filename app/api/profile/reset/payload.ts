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
 *     (`professional_income_eur` / `foyer_fiscal_parts` retirés en CS1
 *     mais encore lus en aval — cf. /immobilier et /portefeuille).
 *     Consolidation 1 — `invest_mensuel` et `fiscal_situation` DROP COLUMN
 *     (migration 052), retirés du payload.
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
  // QW1+consolidation 1 — `invest_mensuel` DROP COLUMN (migration 052) :
  // retiré du payload (la colonne n'existe plus en DB).
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
  // ── Wizard Step 10 (CS5) ────────────────────────────────────────────
  proprietaire_rp_status: null,
  // ── Wizard Step 9 — CS4 boussole d'objectifs ────────────────────────
  objectifs_axes:         null,
  // ── Legacy /parametres CS1 (UI retirée, colonnes DB conservées car
  //    encore lues en aval : `professional_income_eur` dans /immobilier,
  //    `foyer_fiscal_parts` dans tax-estimate). Consolidation 1 :
  //    `fiscal_situation` DROP COLUMN (migration 052), retiré du payload.
  professional_income_eur: 0,         // ramené au défaut DB
  foyer_fiscal_parts:      1.0,       // ramené au défaut DB
  // ── Sentinelles wizard ──────────────────────────────────────────────
  wizard_step_completed: 0,
  profile_completed_at:  null,
  // ── Onboarding 60s ─────────────────────────────────────────────────
  onboarding_quick_done: false,
  onboarding_quick_data: null,
} as const
