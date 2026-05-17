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

---

## Phase 2 — Streaming SSE ✅

**Date :** 2026-05-18
**Périmètre :** conversion de la route en Server-Sent Events pour que les réponses arrivent token par token, hook React `useAriaStream`, helpers SSE partagés.

### Fichiers ajoutés/modifiés

| Fichier | Rôle |
|---|---|
| `lib/aria/sse.ts` (nouveau) | Helpers SSE partagés : `encodeSSEFrame`, `parseSSEFrame`, `createSSEParser`. Types `AriaSSEEvent` (meta/delta/done/error). |
| `app/api/aria/chat/route.ts` (modifié) | Convertie en `ReadableStream<Uint8Array>` + `NextResponse` avec headers SSE. Emet `meta` → `delta`* → `done` (ou `error`). Persistance du message assistant à la fin du stream, juste avant `done`. |
| `hooks/use-aria-stream.ts` (nouveau) | Hook React client. État `{ messages, conversationId, isStreaming, lastError }`, méthodes `sendMessage`, `cancel`, `reset`. Consomme le SSE via `fetch + getReader + createSSEParser`. Abort sur unmount. |
| `lib/aria/__tests__/sse.test.ts` (nouveau) | 22 tests : encode, parse, parser streaming (chunks fragmentés / multi-frames / flush). |
| `app/api/aria/chat/route.test.ts` (nouveau) | 6 tests d'intégration : mocke Anthropic SDK + Supabase, vérifie ordre des frames + persistance user/assistant + cas d'erreur. |

### Protocole SSE

Format des évènements (préfixés `data: ` puis `\n\n`) :

```
data: {"type":"meta","conversation_id":"..."}                       ← émis en premier
data: {"type":"delta","delta":"..."}                                ← un par token/chunk
data: {"type":"done","message_id":"...","usage":{...},"model":"..."} ← terminal succès
data: {"type":"error","message":"..."}                               ← terminal erreur
```

Le champ standard `event:` n'est pas utilisé : on reste compatible avec `fetch + getReader` (EventSource ne supporte pas POST).

### Validation Phase 2

```
✓ npx vitest run     → 883/883 tests passent (+29 nouveaux pour Phase 2)
✓ npx tsc --noEmit   → silence
✓ npx eslint . --max-warnings 0 → silence
```

### Comment tester en local

```bash
# Streaming via curl (les chunks arrivent au fil de l'eau)
curl -N -X POST http://localhost:3000/api/aria/chat \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <session cookies>' \
  -d '{"messages":[{"role":"user","content":"Salut"}]}'
```

Côté React :

```tsx
'use client'
import { useAriaStream } from '@/hooks/use-aria-stream'

function ChatDemo() {
  const { messages, sendMessage, isStreaming } = useAriaStream({ ui: { section: 'dashboard' } })
  return (
    <>
      {messages.map((m, i) => <div key={i}>{m.role}: {m.content}</div>)}
      <button onClick={() => sendMessage('Salut ARIA')} disabled={isStreaming}>Envoyer</button>
    </>
  )
}
```

---

## Phase 3 — Tool calls ✅

**Date :** 2026-05-18
**Périmètre :** 6 tools que Claude peut appeler pour exécuter de vraies fonctions de l'app, boucle `tool_use → tool_result` dans la route streaming, events SSE `tool_use` et `tool_result`.

### Fichiers ajoutés/modifiés

| Fichier | Rôle |
|---|---|
| `lib/aria/tools/definitions.ts` | 6 schémas JSON-Schema des tools (descriptions FR détaillées — c'est elles qui guident Claude). |
| `lib/aria/tools/projectionInputs.ts` | Helper `buildProjectionInputs(p)` — reconstruit `ProjectionInputs` depuis `PatrimoineComplet` pour les 3 tools de simulation. |
| `lib/aria/tools/executors/simulerNouveauDCA.ts` | Wrappe `projectionGlobale` + `projectionFIREIntervalle`. |
| `lib/aria/tools/executors/simulerStressTest.ts` | Wrappe `simulerStress` + `SCENARIOS_STRESS` (6 scénarios canoniques). |
| `lib/aria/tools/executors/simulerAcquisitionFuture.ts` | Wrappe `projectionGlobale` avec `acquisitionsFutures` injectées. |
| `lib/aria/tools/executors/chercherPosition.ts` | Recherche fuzzy dans `patrimoine.positions` (nom/ticker/ISIN). |
| `lib/aria/tools/executors/obtenirDetailBien.ts` | Détail d'un bien immo, candidats si ambigu. |
| `lib/aria/tools/executors/obtenirHistoriquePatrimoine.ts` | Lit `wealth_snapshots`, échantillonne à 20 points, calcule variation. |
| `lib/aria/tools/index.ts` | `ARIA_TOOLS` + dispatcher `executeTool(name, input, ctx)` avec capture d'erreurs. |
| `lib/aria/sse.ts` (modifié) | Ajout types `AriaSSEToolUse` / `AriaSSEToolResult` dans l'union `AriaSSEEvent`. |
| `app/api/aria/chat/route.ts` (modifié) | Boucle `tool_use` (max 5 itérations), persistance `tool_calls` + `tool_results` dans `aria_messages`, events SSE relais. |

### Format SSE étendu

```
data: {"type":"meta",        "conversation_id":"..."}
data: {"type":"delta",       "delta":"..."}
data: {"type":"tool_use",    "tool_use_id":"...", "name":"...", "input":{...}}
data: {"type":"tool_result", "tool_use_id":"...", "success":true, "data":{...}}
data: {"type":"done",        "message_id":"...", "usage":{...}}
data: {"type":"error",       "message":"..."}
```

### Tools disponibles

| Nom | Question utilisateur typique |
|---|---|
| `simulerNouveauDCA` | « Si je passe mon DCA à 1500 €/mois ? » |
| `simulerStressTest` | « Simule un krach de -40 % » / « Que se passe-t-il si je perds mon emploi ? » |
| `simulerAcquisitionFuture` | « Si j'achète un appart de 200 k€ dans 2 ans ? » |
| `chercherPosition` | « Où en est mon LVMH ? » |
| `obtenirDetailBien` | « Donne-moi le détail de mon bien à Saint-Brieuc » |
| `obtenirHistoriquePatrimoine` | « Comment a évolué mon patrimoine sur 90 jours ? » |

### Sécurité anti-boucle

`MAX_TOOL_ITERATIONS = 5`. Si Claude n'a pas terminé après 5 tours, on coupe et on annexe `[ARIA a atteint la limite d'itérations tool — réponse partielle]` à la réponse.

### Règle #1 respectée

Chaque executor **importe** une fonction canonique :
- `projectionGlobale`, `projectionFIREIntervalle` ← `lib/analyse/projectionFIRE.ts`
- `simulerStress`, `SCENARIOS_STRESS` ← `lib/analyse/stressTest.ts`
- `swrPctFromFireType` ← `lib/analyse/projectionFIRE.ts`

Aucune logique de simulation ré-implémentée.

### Validation Phase 3

```
✓ npx vitest run     → 909/909 tests passent (+26 nouveaux pour Phase 3)
✓ npx tsc --noEmit   → silence
✓ npx eslint . --max-warnings 0 → silence
```

### Prochaine étape

**Phase 4 — Mémoire persistante long terme** : résumés de conversations passées injectés dans le system prompt, table `aria_user_insights` (préoccupations / objectifs / préférences détectées). **À démarrer après validation utilisateur.**
