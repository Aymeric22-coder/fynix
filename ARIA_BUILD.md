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

### Prochaine étape

**Phase 3 — Tool calls** : ARIA pourra appeler des fonctions de l'app (`simulerNouveauDCA`, `simulerStressTest`, `chercherPosition`, etc.). Chaque executor importera les fonctions canoniques existantes. **À démarrer après validation utilisateur.**
