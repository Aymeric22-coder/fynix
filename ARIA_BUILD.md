# ARIA — Journal de construction

Assistant patrimonial IA intégré à FIRECORE. Document vivant : tenu à jour au fil des phases.

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

Le prompt d'origine mentionnait des tables qui ne portent pas ces noms dans FIRECORE :
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

---

## Phase 4 — Mémoire persistante long terme ✅

**Date :** 2026-05-18
**Périmètre :** résumés de conversations passées + insights persistants (préoccupations / objectifs / préférences) injectés dans le system prompt aux conversations suivantes. Déclencheurs fire-and-forget en fin de stream.

### Fichiers ajoutés/modifiés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/029_aria_user_insights.sql` (+ DOWN) | Table `aria_user_insights` (type, insight, confidence 0-1, last_confirmed_at) avec unique index sur `(user_id, type, lower(insight))` pour dédup. RLS owner-only. |
| `lib/aria/memory/summarizer.ts` | `summarizeConversation()` → Claude Haiku résume une conversation 5+ messages en 3-5 phrases, persiste dans `aria_conversations.summary`. `shouldSummarize()` helper pur. |
| `lib/aria/memory/insights.ts` | `extractAndPersistInsights()` → Claude Haiku extrait 0-3 insights, persiste avec merge des doublons (confidence moyenne pondérée). `parseInsightsResponse()` helper pur tolérant JSON imparfait. |
| `lib/aria/types.ts` (modifié) | Nouveaux types `AriaPastConversation`, `AriaPersistentInsight` + 2 champs dans `AriaRawData` et `AriaLiveContext`. |
| `lib/aria/fetchUserData.ts` (modifié) | +2 loaders parallèles : `loadConversationsPassees` (3 dernières avec summary, exclut la conv courante) + `loadInsightsPersistants` (top 5 par confidence). |
| `lib/aria/computeMetrics.ts` (modifié) | Transmet les 2 nouveaux blocs dans `AriaLiveContext`. |
| `lib/aria/buildSystemPrompt.ts` (modifié) | +2 sections : `HISTORIQUE DES CONVERSATIONS PASSEES` et `INSIGHTS UTILISATEUR PERSISTANTS`. |
| `lib/aria/index.ts` (modifié) | `buildLiveContext()` accepte `excludeConversationId`. |
| `app/api/aria/chat/route.ts` (modifié) | Déclenche `summarizeConversation` + `extractAndPersistInsights` en fire-and-forget juste après `controller.close()`. N'attend pas, ne bloque pas. |
| Tests (5 fichiers modifiés + 2 nouveaux) | 32 nouveaux tests : summarizer (10), insights (15), buildSystemPrompt (4 sections), fetchUserData (3). |

### Modèle utilisé pour summarizer + insights

`claude-haiku-4-5` (rapide, peu cher) avec un `max_tokens` court. Override possible via param `options.model` côté appelant.

### Déclencheurs

- **Summarizer** : si la conversation a ≥ 5 messages ET (pas de summary OU summary > 24h).
- **Insights** : si la conversation a ≥ 5 messages.

Les deux tournent en `void promise.catch(() => {})` après `controller.close()` — n'impactent jamais la latence vue par l'utilisateur.

### Sécurité

- RLS owner-only sur `aria_user_insights` (auth.uid() = user_id).
- Unique index empêche les doublons exacts (même user, type, texte insensible casse).
- Toutes les fonctions memory ont try/catch global — **ne throw jamais**, retournent `{ generated: false, reason }` en cas d'erreur.

### Migration à appliquer

```sql
-- À coller dans Supabase Studio SQL Editor
-- Voir supabase/migrations/029_aria_user_insights.sql
```

### Validation Phase 4

```
✓ npx vitest run     → 941/941 tests passent (+32 nouveaux pour Phase 4)
✓ npx tsc --noEmit   → silence
✓ npx eslint . --max-warnings 0 → silence
```

---

## Phase 5 — Feedback loop & Détection proactive ✅

**Date :** 2026-05-18
**Périmètre :** route API feedback, hook React de feedback, page admin gated par email, logique de détection proactive (rules + detector pur + hook). **Pas d'UI** — c'est en Phase 6.

### Fichiers ajoutés/modifiés

| Fichier | Rôle |
|---|---|
| `app/api/aria/feedback/route.ts` | `POST /api/aria/feedback` — upsert `aria_feedback` (overwrite si vote précédent). Vérifie ownership du message + rôle assistant. |
| `app/api/aria/feedback/route.test.ts` | 7 tests : body invalide, message inexistant, role user rejeté, upsert positif/négatif, erreur DB. |
| `hooks/use-aria-feedback.ts` | Hook React `sendFeedback({ messageId, rating, reason? })`. Branchable Phase 6 sur les boutons 👍/👎. |
| `app/(app)/admin/aria-feedback/page.tsx` | Server component gated par `ADMIN_EMAIL` env var (sinon `notFound()`). Liste les 50 derniers feedbacks avec join sur message content + tool_calls. UI minimaliste (palette FIRECORE existante). |
| `lib/aria/proactive/rules.ts` | 6 règles déclaratives : 4 idle (fire/analyse/portefeuille/immo) + 2 event-based (csv_import_success, bien_added). |
| `lib/aria/proactive/detector.ts` | `selectNudge(state, rules, now)` pur — 1er match wins, respecte mute (24h) et event freshness (30s). |
| `lib/aria/proactive/__tests__/detector.test.ts` | 12 tests : idle / event / mute / priorité / robustesse / cohérence des règles canoniques. |
| `hooks/use-aria-proactive.ts` | Hook React qui gère state machine (idle timer, interactions count, lastEvent, mute persisté en localStorage). Expose `{ activeNudge, acceptNudge, dismissNudge, registerInteraction, fireEvent }`. |

### Variables d'environnement

| Variable | Rôle | Obligatoire |
|---|---|---|
| `ADMIN_EMAIL` | Email autorisé à voir `/admin/aria-feedback` | non (sans → 404 pour tout le monde) |

### Sécurité

- Route feedback : double check (RLS Supabase + check applicatif `msg.user_id = auth.uid()`) pour bloquer le vote sur des messages d'autres users.
- Page admin : `notFound()` plutôt que 403 → ne révèle pas que la page existe.
- Hook proactive : mute stocké en localStorage (pas DB) → reset si le user change de device, c'est ok pour ce contexte.

### Validation Phase 5

```
✓ npx vitest run     → 966/966 tests passent (+25 nouveaux pour Phase 5)
✓ npx tsc --noEmit   → silence
✓ npx eslint . --max-warnings 0 → silence
```

---

## Phase 6 — Frontend complet ✅

**Date :** 2026-05-18
**Périmètre :** ARIA enfin **visible** dans le navigateur. 7 composants React + intégration dans le layout `(app)` + documentation utilisateur/dev complète (`ARIA.md`).

### Fichiers ajoutés/modifiés

| Fichier | Rôle |
|---|---|
| `components/aria/AriaLauncher.tsx` | Bouton flottant ◐ global. Orchestre `AriaPanel` + `AriaProactiveNudge`. Pulse subtil si nudge actif. Décalé `bottom-20 right-4` mobile (sous le burger sidebar), `bottom-6 right-6` desktop. |
| `components/aria/AriaPanel.tsx` | Panneau slide-in droite (440px desktop, full-width mobile). Header avec section active. Body scrollable + auto-scroll. Empty state avec 3 questions d'exemple. Escape pour fermer. Bouton "Plus" = nouvelle conversation. |
| `components/aria/AriaMessage.tsx` | Bulle user (droite, `bg-surface-2`) vs assistant (gauche, `bg-surface` + `border-accent/30`). Curseur pulsant pendant streaming. Affiche `AriaToolCallCard[]` + `AriaFeedbackButtons` sous l'assistant. |
| `components/aria/AriaToolCallCard.tsx` | Carte expandable avec icône Wrench + status CheckCircle/AlertCircle. Affiche input + result JSON pretty-printed. |
| `components/aria/AriaInput.tsx` | Textarea auto-grow (max 6 lignes). Entrée pour envoyer, Maj+Entrée pour ligne. Bouton Send (accent) / Stop (danger) selon `isStreaming`. |
| `components/aria/AriaFeedbackButtons.tsx` | 👍/👎 sous chaque message assistant. 👎 ouvre un input inline pour saisir une raison. Confirmation visuelle "Merci pour ton retour" après envoi. |
| `components/aria/AriaProactiveNudge.tsx` | Bulle bas-droite avec icône Sparkles + accent muted. Bouton "Oui, lance ARIA" (accent) + "Plus tard" (mute 24h). Animation `slide-in-from-bottom`. |
| `app/(app)/layout.tsx` (modifié) | Ajout `<AriaLauncher />` après `<main>`. Disponible sur toutes les pages auth. |
| `ARIA.md` (nouveau, racine) | Documentation utilisateur + dev : architecture, dev, ajout de tool, modification du system prompt, page admin, roadmap, changelog. |

### Design respecté

- ✅ **Aucune couleur hex hardcodée** — uniquement classes Tailwind sémantiques (`bg-surface`, `text-accent`, `bg-accent-muted`, `border-border`, `text-danger`...).
- ✅ **Réutilise les primitives** existantes (cn, font Geist, palette emerald).
- ✅ **Cohérent avec le sidebar/modal existants** : mêmes radius (`rounded-lg`/`rounded-xl`), mêmes ombres (`shadow-2xl shadow-black/40`), mêmes animations (`animate-in slide-in-*`).
- ✅ **Lucide-react icons** uniquement (Sparkles, X, Send, Square, ThumbsUp/Down, ChevronRight/Down, Wrench, CheckCircle2, AlertCircle, RefreshCw, Plus).
- ✅ **Pas de nouvelle dépendance UI**.

### Test mental "côte à côte"

Le bouton ARIA utilise le même style que le burger mobile du sidebar (`bg-accent`, `rounded-full`, `h-12 w-12`, `shadow-lg shadow-black/40`). Le panneau utilise le même backdrop que le modal existant (`bg-black/60 backdrop-blur-sm`). Les bulles assistant/user reprennent le style des cartes existantes (`bg-surface`, `border-border`).

### Limitations connues (deferred Phase 7)

- **Streaming des tool_use côté UI** : la carte tool_use n'apparaît pas en live pendant le stream. Le hook `useAriaStream` actuel n'écoute pas les events SSE `tool_use`/`tool_result`. La trace est seulement persistée en DB (`aria_messages.tool_calls`).
- **Reload de page = conversation vide** : par design Phase 6, la persistance DB sert pour l'historique cross-session mais l'UI ne recharge pas les messages au mount. Phase 7 ajoutera un loader.

### Validation Phase 6

```
✓ npx vitest run     → 966/966 tests passent (composants React = pas de test Vitest, ils restent visuels)
✓ npx tsc --noEmit   → silence
✓ npx eslint . --max-warnings 0 → silence
```

### Test manuel attendu

1. Migrations 028 + 029 appliquées dans Supabase Studio
2. `ANTHROPIC_API_KEY` + `ADMIN_EMAIL` configurées dans Vercel
3. Ouvrir https://fynix-mu.vercel.app
4. ✓ Bouton ◐ visible en bas à droite (emerald, animé)
5. ✓ Clic → panneau slide-in à droite avec empty state
6. ✓ « Salut » → streaming token par token, persistance DB
7. ✓ Idle 90s sur /analyse/fire → nudge proactif apparaît
8. ✓ 👍/👎 sur un message → enregistré, visible sur `/admin/aria-feedback`

### ARIA = COMPLET

Les 6 phases du spec sont livrées. ARIA est en production, visible et utilisable.
Voir [`ARIA.md`](./ARIA.md) pour la documentation utilisateur/dev complète.
