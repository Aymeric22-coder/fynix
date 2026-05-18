# Next Actions — FIRECORE

Décisions produit en attente et opérations à programmer après les Sprints 0, 1, 2 et 3.

---

## ✅ 1. Suppression de la table `patrimony_snapshots` — RÉSOLU (Sprint 3)

Le scénario A a été exécuté :
- Migration **026** (backfill) et **027** (DROP) prêtes à appliquer.
- `/api/dashboard`, `/api/snapshots` migrés sur `wealth_snapshots`.
- Edge Function `snapshot-daily` retournée en 410 Gone.

**Ordre de déploiement prod** (cf. AUDIT_FIXES.md > Sprint 3) :

1. Déployer le code Sprint 3 sur Vercel (`master`).
2. Désactiver le cron Supabase :
   ```sql
   SELECT cron.unschedule('snapshot-daily-cron');
   ```
3. Appliquer migration **026** (`SQL Editor` → contenu de `supabase/migrations/026_patrimony_to_wealth_backfill.sql`).
4. Vérifier :
   ```sql
   SELECT
     (SELECT COUNT(*) FROM patrimony_snapshots) AS legacy_count,
     (SELECT COUNT(*) FROM wealth_snapshots)    AS new_count;
   ```
   `new_count >= legacy_count` attendu.
5. Appliquer migration **027** (`DROP TABLE`).

---

## 2. Révision annuelle des constantes fiscales

Les constantes France 2026 sont dans :
- `lib/analyse/constants.ts` — PS 17,2 %, PFU 30 %, AV long terme 24,7 %, abattements AV (célibataire/couple), TMI fallback 30 %, SWR par fire_type.
- `lib/analyse/optimiseurFiscal.ts` — `PEA_PLAFOND_VERSEMENTS`, `PER_PLAFOND_ABSOLU_2026`, `LIVRET_A_PLAFOND`, `LDDS_PLAFOND`, `DEFICIT_FONCIER_PLAFOND_GLOBAL`, `RENDEMENT_MONETAIRE_PCT`, `YIELD_DIVIDENDES_PCT`.
- `lib/analyse/regimeFiscalImmo.ts` — `PLAFOND_MICRO_FONCIER` (15 000 €), `PLAFOND_MICRO_BIC` (77 700 €), `TMI_SEUIL_REEL_PCT` (30 %).
- `lib/analyse/scpiCashflow.ts` — `DEFAULT_SCPI_YIELD_PCT` (4,0 %).
- `lib/real-estate/fiscal/common.ts` — règles foncier (déficit, abattement micro), source canonique pour le moteur fiscal complet.

### Procédure annuelle

Chaque **janvier** :

1. Vérifier la **loi de finances** pour l'année en cours :
   - PASS (Plafond Annuel Sécurité Sociale) → impact `PER_PLAFOND_ABSOLU_*` (rename si nécessaire, ex. `_2027`).
   - Barème IR / TMI → impact des seuils utilisés dans l'optimiseur.
   - Évolution PFU / IS → recheck `PFU_PCT` et `SCI_IS_RATE_PCT`.
   - Plafonds livrets réglementés (Livret A, LDDS, LEP).
   - Évolution déficit foncier (plafond temporaire 21 400 € possible jusqu'en 2027).

2. **Mettre à jour `lib/analyse/constants.ts`** en premier, puis répercuter sur les modules qui dépendent encore de constantes locales (`optimiseurFiscal.ts`, `regimeFiscalImmo.ts`).

3. **Rendement SCPI** : checker la **médiane IEIF / ASPIM** publiée chaque année. Le défaut 4 % est conservateur mais peut être ajusté à 4,5 % si la médiane bouge.

4. **Lancer les tests** : `npx vitest run`. Les tests sur constantes (ex. `optimiseurFiscal.test.ts`) doivent être ajustés en même temps que les valeurs.

5. **Commit dédié** avec préfixe `data:` (cf. CLAUDE.md) :
   ```
   data: mise à jour constantes fiscales France 2027
   ```

### Rappel automatique

Ajouter une tâche dans le tableau de bord produit ou un cron interne qui ouvre une issue chaque 15 janvier avec le checklist ci-dessus.

---

## 3. Provisioning du cron `monthly-report` Supabase

L'Edge Function Supabase `monthly-report` est planifiée **manuellement** dans le Dashboard Supabase (cf. CLAUDE.md `Cron Supabase (Sprint 6)`). Cette config n'est versionnée nulle part dans le repo → risque de perte lors d'une recréation d'environnement.

### Script à documenter / scripter

Créer `supabase/functions/monthly-report/cron.sql` :

```sql
-- =============================================================
-- Cron Supabase — monthly-report
-- =============================================================
-- À exécuter UNE SEULE FOIS dans le SQL Editor du dashboard Supabase
-- après chaque déploiement de la fonction. Idempotent.
--
-- Planification : le 1er du mois à 07:00 UTC (≈ 08:00 Paris hiver,
-- 09:00 Paris été).
--
-- Pré-requis :
--   - L'extension pg_cron doit être activée dans le projet
--     (Settings → Database → Extensions).
--   - Les secrets APP_URL et CRON_SECRET sont configurés dans
--     Edge Functions → Secrets.
-- =============================================================

SELECT cron.schedule(
  'monthly-report-cron',
  '0 7 1 * *',  -- minute heure jour-du-mois mois jour-semaine
  $$
  SELECT net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/monthly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Vérification : doit lister 'monthly-report-cron' avec next_run_at proche du 1er du mois.
-- SELECT jobname, schedule, command FROM cron.job;

-- Pour supprimer (rollback) :
-- SELECT cron.unschedule('monthly-report-cron');
```

### Étapes de déploiement

1. Remplacer `<project-ref>` par l'ID du projet Supabase (visible dans Settings → API).
2. Ajouter le `CRON_SECRET` comme `app.settings.cron_secret` :
   ```sql
   ALTER DATABASE postgres SET "app.settings.cron_secret" = 'le-secret-en-clair';
   ```
   (ou récupérer depuis un secret manager — Supabase Vault est encore en beta).
3. Exécuter le script ci-dessus.
4. Vérifier dans `cron.job_run_details` après le 1er du mois suivant.

### Alternative recommandée

Vercel Cron est déjà utilisé pour `/api/cron/refresh-prices`. Migrer `monthly-report` côté Vercel éliminerait l'Edge Function Supabase et centraliserait toute la planification :

```json
// vercel.json — proposition
{
  "crons": [
    { "path": "/api/cron/refresh-prices",    "schedule": "0 8 * * *" },
    { "path": "/api/email/monthly-report",   "schedule": "0 7 1 * *" }
  ]
}
```

Avec cette approche, le `CRON_SECRET` est injecté automatiquement par Vercel et la route Next.js gère tout. Plus besoin de Supabase Edge Function.

**Décision attendue** : choisir entre Edge Function Supabase (statu quo) ou migration Vercel Cron.

---

## 4. Autres dettes ouvertes (low priority)

| Ref | Sujet | Raison |
|---|---|---|
| Tests composants | Pas de jsdom configuré | Ajouter `@testing-library/react` + `jsdom` quand un test composant deviendra critique. |
| CLI Supabase types | `database.types.ts` maintenu manuellement | Configurer `npx supabase login` + automate `npx supabase gen types` dans le hook ou un script CI. |
| Audit deps | `npm audit` signale 2 vuln (1 moderate, 1 high) | Lancer `npm audit fix` après vérification de non-breaking-change. |

---

*Dernière mise à jour : Sprint 3 (2026-05-17). Point 1 (suppression `patrimony_snapshots`) résolu — migrations 026 + 027 prêtes à appliquer en prod.*
