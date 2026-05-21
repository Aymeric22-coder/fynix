# DOMAINE 6 — ÉTAT DE LA BASE DE DONNÉES

## Score : 4.5/10

## Synthèse

Les **DDL des migrations sont correctes** (RLS activée sur les nouvelles tables, index présents sur les patterns courants, contraintes CHECK cohérentes), mais le projet souffre de **trois problèmes structurels graves** :

1. **Numérotation cassée** : il existe DEUX `031_*` et DEUX `033_*` (le numéro 033 sert à la fois pour `usage_type` et `transactions_external_ref_unique`). Selon l'ordre alphabétique appliqué par `supabase db push`, l'une ou l'autre sera exécutée en premier — comportement non déterministe d'une machine à l'autre.
2. **Migration `039_cascade_delete.sql` introuvable**, et `043` est `property_coordinates.sql` (pas `events_short_term.sql`). La consigne d'audit listait un `044_property_coordinates.sql` qui n'existe pas non plus — la dernière migration sur disque est `043_property_coordinates.sql`. Les "nouveaux kinds" courte durée ont été **fusionnés dans `042_short_term_rental.sql`** (ligne 92-113) au lieu de faire l'objet d'une migration `043_events_short_term.sql` séparée.
3. **Types TypeScript désynchronisés** : `Profile`, `Debt`, `RealEstateProperty`, `PropertyCharges` ne déclarent PAS les colonnes ajoutées par les migrations 034, 036, 037, 040, 043. Le code accède aux colonnes manquantes via des casts `as unknown as { col?: T }`, ce qui désactive toute vérification statique.

Aucune migration n'est probablement « non appliquée » au sens où le code consomme effectivement chacune des colonnes des migrations 033–043 (sauf incohérences notées plus bas). Mais les casts massifs prouvent que la régénération des types via `supabase gen types typescript` n'est jamais lancée — ce qui crée un risque permanent de drift.

---

## 6.1 Migrations

### Liste réelle (disque) 030 → 043

| Fichier | Présent ? |
|---|---|
| `030_recos_done.sql` | OK |
| `031_onboarding_quick.sql` | OK (**conflit n°31 avec ↓**) |
| `031_drop_dca_tables.sql` | OK (**conflit n°31 avec ↑**) |
| `032_transactions_indexes.sql` | OK |
| `033_usage_type.sql` | OK (**conflit n°33 avec ↓**) |
| `033_transactions_external_ref_unique.sql` | OK (**conflit n°33 avec ↑**) |
| `034_multi_credit.sql` | OK |
| `035_market_rent.sql` | OK |
| `036_foyer_fiscal.sql` | OK |
| `037_sci_cca.sql` | OK |
| `038_tax_incentives.sql` | OK |
| `039_cascade_delete.sql` | **MANQUANT** |
| `040_charges_exhaustives.sql` | OK |
| `041_property_events.sql` | OK |
| `042_short_term_rental.sql` | OK (contient l'extension `property_events.kind` initialement prévue dans 043) |
| `043_events_short_term.sql` | **MANQUANT** (logiquement fusionné dans `042`) |
| `043_property_coordinates.sql` | OK (numéro 043 réutilisé pour les coordonnées) |
| `044_property_coordinates.sql` | **MANQUANT** (en réalité posé sur le slot 043) |

### Migrations attendues mais manquantes / mal numérotées

- **039_cascade_delete.sql** : MANQUANT (`supabase/migrations/` saute de `038` à `040`). Les contraintes CASCADE existent dans la définition originale (001_initial_schema.sql:268-303 et migration 006), donc l'effet est probablement déjà acquis pour `real_estate_properties`/`real_estate_lots`/`property_charges`/`debts.asset_id`. Pas de risque fonctionnel immédiat, mais la consigne d'audit attendait un fichier dédié — il n'a pas été produit. À documenter ou à ajouter formellement.
- **043_events_short_term.sql** : MANQUANT — **FUSIONNÉ** dans `042_short_term_rental.sql:92-113` qui ajoute les kinds `booking_cancellation`, `platform_payout`, `guest_damage`, `platform_dispute`, `seasonal_closure` via `DROP CONSTRAINT … ADD CONSTRAINT`. Acceptable d'un point de vue fonctionnel mais s'éloigne du plan annoncé.
- **044_property_coordinates.sql** : MANQUANT — posé en réalité sur le slot **043** (`043_property_coordinates.sql`). C'est une erreur de numérotation : deux fichiers différents portent le préfixe `043_…`.

### Migration par migration

| Migration | Existe ? | Colonnes utilisées dans code ? | Casts dangereux / types manquants ? |
|---|---|---|---|
| 033_usage_type | OK | OUI — `usage_type` typé dans `types/database.types.ts:349` et utilisé dans `app/(app)/immobilier/page.tsx`, `[id]/page.tsx`, `lib/real-estate/portfolio-summary.ts`, `components/real-estate/edit-property-panel.tsx`, `app/api/real-estate/route.ts` etc. | NON (type DB à jour) |
| 034_multi_credit | OK | OUI — `loan_kind` utilisé dans `app/api/real-estate/[id]/credit/route.ts:35,170,184,192`, `components/real-estate/multi-credit-list.tsx`, `credit-form.tsx`, `app/(app)/immobilier/[id]/page.tsx`, `nouveau/page.tsx` | **OUI** — `Debt` (types/database.types.ts:265-306) **n'a PAS** `loan_kind`. La route credit déclare son propre type local (line 35) au lieu d'utiliser le type DB |
| 035_market_rent | OK | OUI — `market_rent`/`market_rent_updated_at` dans `lib/real-estate/under-rent.ts`, `components/forms/add-lot-form.tsx`, `incentive-form.tsx`, etc. | NON — `RealEstateLot.market_rent` typé (types/database.types.ts:386-387) |
| 036_foyer_fiscal | OK | OUI — `professional_income_eur`/`foyer_fiscal_parts` lus dans `app/(app)/parametres/parametres-form.tsx:26,29,105,106` et `app/(app)/immobilier/page.tsx` | **OUI** — `Profile` (types/database.types.ts:152-221) **n'a PAS** ces colonnes. Accès via `as { professional_income_eur?: number \| null } \| null` (parametres-form.tsx:26,29) |
| 037_sci_cca | OK | OUI — `cca_amount` lu dans `app/(app)/immobilier/[id]/page.tsx:709` | **OUI** — `RealEstateProperty` (types/database.types.ts:312-352) **n'a PAS** `cca_amount`. Accès via `(propTyped as unknown as { cca_amount?: number \| null }).cca_amount` (page.tsx:709) |
| 038_tax_incentives | OK | OUI — table `property_tax_incentives` exploitée dans `app/api/real-estate/[id]/incentive/route.ts`, `components/real-estate/incentives/*`, `app/(app)/immobilier/[id]/page.tsx:90`, `lib/real-estate/fiscal/incentives/reduction-schedule.ts` | **OUI** — aucune interface `PropertyTaxIncentive` exportée dans `types/database.types.ts` (grep négatif). Les routes typent inline |
| 039_cascade_delete | **MANQUANT** | n/a | n/a — CASCADE déjà posé dans 001 / 006 sur les FK critiques (`real_estate_properties.asset_id`, `real_estate_lots.property_id`, etc.). Pas de bug fonctionnel observé |
| 040_charges_exhaustives | OK | OUI — `taxe_habitation`, `condo_fees_works`, `insurance_mrh`, `insurance_gli_eur/pct`, `management_agency_eur/pct` etc. utilisés dans `lib/real-estate/charges-resolver.ts`, `build-from-db.ts`, `components/real-estate/charges-form.tsx` | **OUI** — `PropertyCharges` (types/database.types.ts:428-444) ne déclare que les colonnes 001/005 (`taxe_fonciere`, `insurance`, `accountant`, `cfe`, `condo_fees`, `maintenance`, `other`, `vacancy_rate`). Les ~20 colonnes de la mig 040 sont absentes |
| 041_property_events | OK | OUI — table `property_events` exploitée dans `app/api/real-estate/[id]/events/*`, `lib/real-estate/tracking.ts`, `app/(app)/immobilier/[id]/page.tsx:384`, `components/real-estate/add-event-modal.tsx` | NON apparent — `PropertyEventKind` typé (types/database.types.ts:50) |
| 042_short_term_rental | OK (+ extension `property_events.kind`) | OUI — `rental_type`, `nightly_rate_*`, `occupancy_rate_pct`, `seasonality_coefficients`, `tourism_classification` utilisés dans `lib/real-estate/short-term/revenue.ts`, `components/real-estate/short-term-lot-fields.tsx`, `add-lot-form.tsx`, `build-from-db.ts` ; kinds courte durée référencés dans `add-event-modal.tsx` | NON — `RealEstateLot` (types/database.types.ts:392-410) inclut les nouvelles colonnes |
| 043_events_short_term | **MANQUANT** (fusionné dans 042) | Voir ci-dessus | n/a |
| 043_property_coordinates (réel) | OK | OUI — `latitude`/`longitude` dans `components/real-estate/portfolio/property-map.tsx`, `app/api/real-estate/geocode-missing/route.ts:43,88-90`, `app/(app)/immobilier/page.tsx:143-144` | **OUI** — `RealEstateProperty` n'a PAS `latitude`/`longitude`/`geocoded_at`. Accès via `(p as unknown as { latitude?: number \| null }).latitude` (immobilier/page.tsx:143-144) |
| 044_property_coordinates | **MANQUANT** (le contenu est dans 043) | n/a | n/a |

---

## 6.2 RLS

| Table | RLS activée ? | Policies SELECT/INSERT/UPDATE/DELETE ? |
|---|---|---|
| `property_events` (mig 041) | OUI (041_property_events.sql:62) | **Policy unique `user_own_events`** USING + WITH CHECK — couvre les 4 verbes par défaut (Supabase applique la policy ALL si aucune policy spécifique par commande n'est définie). OK. |
| `property_tax_incentives` (mig 038) | OUI (038_tax_incentives.sql:58) | **Policy unique `user_own_data`** USING + WITH CHECK — idem, ALL implicite. OK. |
| `lot_seasonality` | **Table inexistante** — la saisonnalité est stockée en `JSONB` directement sur `real_estate_lots.seasonality_coefficients` (mig 042:73). Pas de table dédiée, donc pas de souci RLS. RLS de `real_estate_lots` héritée (préexistante depuis 001). |

**Verdict RLS** : pas de bug critique. Les deux nouvelles tables ont bien `ENABLE ROW LEVEL SECURITY` + une policy permissive sur les 4 verbes par identification `user_id = auth.uid()`. Aucun risque de fuite cross-user.

> **Nuance** : la pratique `CREATE POLICY "name" ON t USING (…) WITH CHECK (…)` sans `FOR …` crée une policy `FOR ALL`, ce qui est volontaire ici. Si à terme on souhaite des policies différenciées (ex. INSERT seulement à soi-même mais SELECT cross-foyer pour partage SCI), il faudra revoir.

---

## 6.3 Index

### Index présents dans les migrations 033 → 043

| Index | Table | Migration |
|---|---|---|
| `idx_debts_one_principal_per_asset` (unique, partial) | `debts(asset_id) WHERE status='active' AND loan_kind='principal'` | 034:40 |
| `idx_tax_incentives_property` | `property_tax_incentives(property_id)` | 038:51 |
| `idx_tax_incentives_one_per_property` (unique) | `property_tax_incentives(property_id)` | 038:55 |
| `idx_property_events_property` | `property_events(property_id, event_date DESC)` | 041:55 |
| `idx_property_events_lot` | `property_events(lot_id, event_date DESC)` | 041:57 |
| `idx_property_events_kind` | `property_events(property_id, kind)` | 041:59 |

### Index préexistants (mig 001) utiles pour l'immo

| Index | Table |
|---|---|
| `idx_re_prop_user` | `real_estate_properties(user_id)` (001:586) |
| `idx_re_prop_asset` | `real_estate_properties(asset_id)` (001:587) |
| `idx_re_lots_property` | `real_estate_lots(property_id)` (001:588) |
| `idx_re_lots_user` | `real_estate_lots(user_id)` (001:589) |

### Couverture vs patterns du code

| Pattern | Index couvrant ? |
|---|---|
| Biens par `user_id` (immobilier/page.tsx:28, api/real-estate/route.ts:37) | OUI — `idx_re_prop_user` |
| Lots par `property_id` (api/real-estate/[id]/lots/route.ts:14) | OUI — `idx_re_lots_property` |
| `property_events` par `property_id + event_date DESC` (immobilier/[id]/page.tsx:384, events/route.ts:51) | OUI — `idx_property_events_property` |
| `property_tax_incentives` par `property_id` (immobilier/[id]/page.tsx:90) | OUI — `idx_tax_incentives_property` |
| Géocodage missing : `real_estate_properties.latitude IS NULL` (geocode-missing/route.ts:43) | Pas d'index dédié — acceptable (one-shot batch, requête peu fréquente) |
| `real_estate_properties` filtré par `usage_type` | Pas d'index dédié — pas nécessaire (cardinalité faible, filtrage côté lecture après `user_id`) |

**Verdict index** : couverture correcte. Pas de gap critique.

---

## Bugs critiques de sécurité (RLS manquants)

**Aucun.** Les deux nouvelles tables (mig 038 et 041) ont bien `ENABLE ROW LEVEL SECURITY` + policy `user_id = auth.uid()`.

---

## Migrations probablement non appliquées

Compte tenu que le code en production consomme effectivement chacune des colonnes 033–043 via les composants/routes listés en 6.1, **aucune migration ne semble manquante en production**. Si la production tournait sans la migration 040, par exemple, `lib/real-estate/charges-resolver.ts` (qui lit `insurance_gli_eur`, `condo_fees_works`, etc.) renverrait une erreur Supabase « column does not exist » au chargement de `/immobilier/[id]` — ce n'est pas signalé.

**MAIS** : impossible de garantir l'application réelle sans accès à Supabase. Deux signaux à surveiller :
- Le conflit numérique 031 / 033 peut faire qu'une migration soit appliquée 2× ou jamais selon l'ordre alphabétique appliqué par `supabase db push`.
- L'absence de `039_cascade_delete.sql` peut faire qu'une review différentielle (script externe qui liste les migrations attendues) signale une régression.

---

## Casts dangereux à cause de types manquants

Localisations à corriger en régénérant `types/database.types.ts` (`supabase gen types typescript`) :

| Fichier:line | Cast | Cause (migration) |
|---|---|---|
| `app/(app)/immobilier/[id]/page.tsx:709` | `(propTyped as unknown as { cca_amount?: number \| null }).cca_amount` | 037 — colonne `cca_amount` absente de l'interface `RealEstateProperty` |
| `app/(app)/immobilier/page.tsx:143-144` | `(p as unknown as { latitude?: number \| null }).latitude` et idem `longitude` | 043 — colonnes `latitude`/`longitude` absentes |
| `app/(app)/parametres/parametres-form.tsx:26,29` | `(profile as { professional_income_eur?: number \| null } \| null)` et idem `foyer_fiscal_parts` | 036 — colonnes absentes de l'interface `Profile` |
| `app/api/real-estate/[id]/credit/route.ts:35` | Type local redéclaré pour `loan_kind` au lieu de réutiliser `Debt` | 034 — colonne `loan_kind` absente de l'interface `Debt` |
| `lib/real-estate/pdf/annual-report.ts:151,164,176` | Plusieurs `as unknown as { property_type?: string }` etc. | Pas lié aux migrations 033-043 (types AssetType / PropertyType déjà connus, juste mauvaise inférence) |
| `components/real-estate/portfolio/property-map.tsx:60` | `(L.Icon.Default.prototype as any)._getIconUrl` | Hors scope DB — patch Leaflet |
| `lib/real-estate/__tests__/incomplete-data.test.ts:91` | `@ts-expect-error` | Test volontaire d'un input partiel — légitime |

Le type `PropertyCharges` (types/database.types.ts:428-444) ne déclare PAS les ~20 colonnes de la migration 040 (`taxe_habitation`, `insurance_gli_eur`, `condo_fees_works`, `management_agency_eur`, etc.). Le fait qu'aucun cast `as unknown as` n'apparaisse dans `charges-resolver.ts` indique probablement que le code lit `prop.charges` typé en `any` (parce que la query Supabase `.select('*')` n'est pas générique-typée). Conséquence : pas de cast visible mais **aucune protection statique** sur ces accès.

---

## Points à clarifier

1. **Conflits de numérotation 031 et 033** : faut-il renommer `031_drop_dca_tables.sql` → `032_drop_dca_tables.sql` et décaler tout le reste, ou peut-on documenter formellement l'ordre voulu ? Risque concret : sur une fresh DB, `supabase db push` peut appliquer `033_usage_type.sql` AVANT ou APRÈS `033_transactions_external_ref_unique.sql` selon le tri locale, pour les deux contenus le résultat reste idempotent (`ADD COLUMN IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`) donc pas de crash, mais c'est sale.
2. **Migration `039_cascade_delete.sql`** : a-t-elle été oubliée ou volontairement supprimée parce que les CASCADE étaient déjà posées en 001/006 ? Le journal git le dira (hors scope lecture-seule).
3. **Migration `043_events_short_term.sql`** : la fusion dans `042` est-elle intentionnelle ? Si oui, mettre à jour la documentation (la consigne de l'audit attendait deux fichiers séparés).
4. **Régénération des types** : pourquoi `Profile`, `Debt`, `RealEstateProperty`, `PropertyCharges` ne sont-ils plus alignés ? Le fichier débute par le commentaire `// Auto-maintenu manuellement — régénérer avec supabase gen types typescript après chaque migration pour rester synchronisé.` — visiblement la consigne n'est plus suivie depuis la migration 034.
5. **Vérification production** : sans accès Supabase, je ne peux pas confirmer que les migrations 040, 041, 042, 043 sont effectivement appliquées. Le fait que le code y accède sans crash visible est un signal positif, pas une preuve.