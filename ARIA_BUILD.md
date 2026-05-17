# ARIA — Journal de construction

Assistant patrimonial IA intégré à FYNIX. Document vivant : tenu à jour au fil des phases.

Spec d'origine : prompt utilisateur du 2026-05-17 (6 phases).

---

## Phase 1 — Fondations & Contexte dynamique ✅

**Date :** 2026-05-18
**Périmètre :** structure de fichiers, migrations Supabase, contexte live qui reconstruit dynamiquement le profil utilisateur à chaque message, route API non-streaming, tests.

### Fichiers ajoutés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/028_aria_init.sql` (+ DOWN) | 4 nouvelles tables : `user_activity_log`, `aria_conversations`, `aria_messages`, `aria_feedback`. RLS owner-only sur les 4. (Numérotée 028 pour ne pas entrer en conflit avec 026/027 en cours côté DB.) |
| `lib/aria/types.ts` | `AriaLiveContext` + sous-types (profil, patrimoine, portefeuille, immo, cash, fire, scores, alertes, actions, UI). |
| `lib/aria/fetchUserData.ts` | Récupère `getPatrimoineComplet` + snapshots wealth + activités, queries en parallèle, `safeQuery` pour ne pas crasher sur erreurs partielles. |
| `lib/aria/computeMetrics.ts` | Mappe `PatrimoineComplet` → `AriaLiveContext`. **Aucune logique métier nouvelle** — aggrège ce que l'aggregateur expose déjà. |
| `lib/aria/buildSystemPrompt.ts` | Assemble un system prompt structuré en 6 sections (identité, concepts FIRE, données temps réel, alertes, actions, UI). |
| `lib/aria/index.ts` | `buildLiveContext({ supabase, userId, ui })` — point d'entrée public. |
| `app/api/aria/chat/route.ts` | `POST /api/aria/chat` non-streaming. Persiste user + assistant dans `aria_messages`, met à jour `last_message_at`. |
| `lib/aria/__tests__/{fixtures,computeMetrics,buildSystemPrompt,fetchUserData}.test.ts` | 44 tests Vitest. |

### Dépendances ajoutées

- `@anthropic-ai/sdk` (3 packages au total avec ses transitive deps)

### Variables d'environnement attendues

| Variable | Rôle | Obligatoire |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Claude | oui (sinon `/api/aria/chat` retourne 500) |
| `ARIA_MODEL` | Override du modèle (défaut `claude-sonnet-4-20250514`) | non |

À configurer dans **Vercel → Settings → Environment Variables** sur Production + Preview.

### Migration Supabase à appliquer

La CLI `db push` n'est pas configurée pour ce projet. Pour activer la Phase 1 en prod :

1. Aller dans **Supabase Studio → SQL Editor**
2. Coller le contenu de `supabase/migrations/028_aria_init.sql` et exécuter
3. Vérifier que les 4 tables apparaissent dans **Table Editor** avec RLS activé

Pour rollback : exécuter `028_aria_init_DOWN.sql`.

### Règles respectées

- **Règle #1 (cohérence des calculs)** : `computeMetrics.ts` consomme `PatrimoineComplet` issu de `lib/analyse/aggregateur.ts`. Aucune duplication des calculs FIRE, scores, immo, etc. Seule la formule des "mois de précaution" est dupliquée (3 lignes) — voir commentaire `Why:` dans `computeMetrics.ts`.
- **Règle #2 (design)** : pas de composant UI dans cette phase (route API seulement). Le design viendra en Phase 6.

### Adaptations du spec d'origine

Le prompt d'origine mentionnait des tables qui ne portent pas ces noms dans Fynix :
- `biens` → `real_estate_properties` (consommé via `getPatrimoineComplet`)
- `credits` → `debts` (idem)
- `loyers` → `real_estate_lots` (idem)
- `patrimony_snapshots` → `wealth_snapshots` (migration 020, utilisé directement)
- `dca_plans` → n'existe pas, l'épargne mensuelle vit dans `profile.fireInputs.epargne_mensuelle`

Aucune nouvelle table de domaine n'a été créée — uniquement les 4 tables ARIA.

### Validation Phase 1

```
✓ npx vitest run     → 854/854 tests passent (44 nouveaux pour lib/aria)
✓ npx tsc --noEmit   → silence
✓ npx eslint . --max-warnings 0 → silence
```

### Comment tester en local

1. Appliquer la migration 026 dans Supabase Studio
2. Ajouter `ANTHROPIC_API_KEY=sk-ant-...` dans `.env.local`
3. `npm run dev`
4. Avec un cookie de session valide :

```bash
curl -X POST http://localhost:3000/api/aria/chat \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <session cookies>' \
  -d '{
    "messages": [{"role": "user", "content": "Présente-moi mon patrimoine en deux phrases."}],
    "ui": {"section": "dashboard"}
  }'
```

Réponse attendue : un JSON `{ content, conversation_id, message_id, usage, model }`. Le `content` doit mentionner les vrais chiffres de l'utilisateur.

### Prochaine étape

**Phase 2 — Streaming SSE** : convertir la route en `ReadableStream` pour que les réponses arrivent token par token. Nécessite aussi un hook React `useAriaStream`. **À démarrer après validation utilisateur.**
