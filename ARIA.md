# ARIA — Assistant patrimonial IA de FIRECORE

Documentation utilisateur et développeur d'ARIA.

ARIA est un assistant IA intégré à FIRECORE qui :
- Connaît en temps réel toutes les données patrimoniales de l'utilisateur (Supabase live)
- Peut exécuter des actions dans l'app via des function calls (simuler stress tests, recalculer FIRE…)
- Garde la mémoire des conversations précédentes au fil des semaines
- Répond en streaming pour une perception de vitesse
- Détecte les blocages utilisateur et propose de l'aide proactivement
- Apprend des feedbacks (👍/👎) pour s'améliorer

---

## 1. Architecture globale

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ AriaLauncher (layout.tsx)                            │  │
│  │  ├─ bouton flottant ◐                                │  │
│  │  ├─ AriaProactiveNudge (bulle bas-droite si nudge)   │  │
│  │  └─ AriaPanel (slide-in droite)                      │  │
│  │       ├─ AriaMessage[] (bulles)                      │  │
│  │       │    ├─ AriaToolCallCard (tool_use expandable) │  │
│  │       │    └─ AriaFeedbackButtons (👍/👎)            │  │
│  │       └─ AriaInput (textarea)                        │  │
│  └──────────────────────────────────────────────────────┘  │
│         │  hooks : useAriaStream, useAriaProactive,         │
│         │          useAriaFeedback                          │
│         ▼                                                   │
│  POST /api/aria/chat          POST /api/aria/feedback       │
│  (Server-Sent Events)         (upsert)                      │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Server (Next.js Route Handler)                             │
│                                                             │
│  app/api/aria/chat/route.ts                                 │
│    1. Auth + validation body                                │
│    2. UPSERT conversation + INSERT message user             │
│    3. buildLiveContext() ← lib/aria                         │
│        ├─ getPatrimoineComplet() ← lib/analyse/aggregateur  │
│        ├─ snapshots + activites (wealth_snapshots, …)       │
│        └─ conversations passées + insights persistants      │
│    4. anthropic.messages.stream({ tools: ARIA_TOOLS })      │
│    5. Boucle tool_use → executors (max 5 iter)              │
│    6. SSE meta → delta* → tool_use/result → done            │
│    7. INSERT message assistant (avec tool_calls/results)    │
│    8. fire-and-forget: summarizer + insights extractor      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase (RLS owner-only)                                  │
│                                                             │
│  aria_conversations    aria_messages                        │
│  aria_feedback         aria_user_insights                   │
│  user_activity_log     wealth_snapshots (existante)         │
└─────────────────────────────────────────────────────────────┘
              │
              ▼ (tools executors importent)
┌─────────────────────────────────────────────────────────────┐
│  Lib métier existante (RÈGLE #1 — pas de duplication)       │
│                                                             │
│  projectionGlobale, projectionFIREIntervalle (lib/analyse)  │
│  simulerStress, SCENARIOS_STRESS                            │
│  calculerKPIsBien, calculerTousLesScores                    │
│  genererRecommandations, swrPctFromFireType                 │
└─────────────────────────────────────────────────────────────┘
```

### Modèles Claude utilisés

| Usage | Modèle | Token max | Source |
|---|---|---|---|
| Chat principal + tools | `claude-sonnet-4-20250514` (override : env `ARIA_MODEL`) | 2048 | `app/api/aria/chat/route.ts` |
| Summarizer conversation | `claude-haiku-4-5` | 256 | `lib/aria/memory/summarizer.ts` |
| Insights extractor | `claude-haiku-4-5` | 384 | `lib/aria/memory/insights.ts` |

---

## 2. Lancer en dev

### Pré-requis

1. **Migrations Supabase** appliquées (dans Supabase Studio → SQL Editor) :
   - `supabase/migrations/028_aria_init.sql` (Phase 1)
   - `supabase/migrations/029_aria_user_insights.sql` (Phase 4)

2. **Variables d'environnement** dans `.env.local` :
   ```bash
   # Obligatoires
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   ANTHROPIC_API_KEY=sk-ant-…

   # Optionnelles
   ARIA_MODEL=claude-sonnet-4-20250514          # override modèle chat
   ADMIN_EMAIL=ton@email.com                    # active /admin/aria-feedback
   ```

### Commandes

```bash
npm run dev         # http://localhost:3000
npm run test        # 1000+ tests Vitest
npm run typecheck   # tsc --noEmit
npm run lint        # eslint --max-warnings 0
```

### Test rapide en navigateur

1. Lance `npm run dev`
2. Connecte-toi sur http://localhost:3000
3. Bouton flottant ◐ en bas à droite → ouvre le panneau ARIA
4. « Résume-moi mon patrimoine en deux phrases. » → réponse streamée
5. « Simule un krach de -30 %. » → tool_use visible dans le message

---

## 3. Ajouter un nouveau tool

Exemple : ajouter `calculerImpotFoncier` qui retourne l'impôt foncier annuel estimé.

### Étape 1 — Schéma JSON dans `lib/aria/tools/definitions.ts`

```ts
{
  name: 'calculerImpotFoncier',
  description: 'Calcule l\'impôt foncier annuel estimé sur l\'ensemble des biens immo. ' +
               'À utiliser quand l\'utilisateur demande "combien je paie en impôt foncier" ou similaire.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
},
```

### Étape 2 — Executor dans `lib/aria/tools/executors/calculerImpotFoncier.ts`

```ts
import type { PatrimoineComplet } from '@/types/analyse'

export async function executeCalculerImpotFoncier(p: PatrimoineComplet) {
  // IMPORTE une fonction canonique de lib/analyse — pas de duplication !
  const impotAnnuelTotal = p.biens.reduce(
    (sum, b) => sum + b.impot_mensuel_estime * 12, 0,
  )
  return { impot_annuel_eur: Math.round(impotAnnuelTotal), nb_biens: p.biens.length }
}
```

### Étape 3 — Dispatcher dans `lib/aria/tools/index.ts`

```ts
case 'calculerImpotFoncier':
  return {
    success: true,
    data: await executeCalculerImpotFoncier(ctx.patrimoine),
  }
```

### Étape 4 — Test dans `lib/aria/tools/__tests__/executors.test.ts`

```ts
it('executeCalculerImpotFoncier somme les impôts mensuels x 12', async () => {
  const p = makePatrimoineFixture({
    biens: [makeBienFixture({ impot_mensuel_estime: 100 })],
  })
  const r = await executeCalculerImpotFoncier(p)
  expect(r.impot_annuel_eur).toBe(1200)
})
```

C'est tout — Claude détectera automatiquement le tool via la description en français.

---

## 4. Modifier le system prompt

Le system prompt est construit dynamiquement dans `lib/aria/buildSystemPrompt.ts` en 8 sections :

| Section | Fonction | Modifiable |
|---|---|---|
| Rôle + comportement | `sectionIdentite()` | ✓ — Édite le tableau de strings |
| Concepts FIRE | `sectionConcepts()` | ✓ — Ajoute/retire des concepts |
| Données temps réel | `sectionDonnees(ctx)` | Indirect — modifie `buildContextFromRaw` pour exposer de nouveaux champs |
| Alertes actives | `sectionAlertes(alertes)` | Indirect — alimentées par `mapAlertes(p)` dans `computeMetrics.ts` |
| Actions récentes | `sectionActions(activites)` | Indirect — lues depuis `user_activity_log` |
| Conversations passées | `sectionConversationsPassees(convs)` | Phase 4 — auto-générées par `summarizeConversation` |
| Insights persistants | `sectionInsightsPersistants(insights)` | Phase 4 — auto-extraits par `extractAndPersistInsights` |
| Section UI active | `sectionUI(ctx)` | Indirect — fourni par le client via `ui.section` |

Pour ajouter une nouvelle section, suis le pattern existant : crée une fonction `sectionXxx()`, ajoute-la dans le `[…].join('\n')` final. Pense à étendre `AriaLiveContext` si elle dépend de nouvelles données.

---

## 5. Consulter les feedbacks (admin)

1. Configure `ADMIN_EMAIL=ton@email.com` dans Vercel env vars (Production + Preview).
2. Connecte-toi avec ce compte.
3. Va sur `https://fynix-mu.vercel.app/admin/aria-feedback`.
4. Tu vois les 50 derniers feedbacks (👎 d'abord, puis 👍).
5. Chaque carte affiche : la raison saisie, le contenu du message ARIA, et un détail expandable des tool_calls.

Sans `ADMIN_EMAIL` configurée → la page renvoie **404 pour tout le monde** (ne révèle pas son existence).

---

## 6. Roadmap des prochaines améliorations

### Court terme (Phase 7+)
- **Streaming tool_use côté UI** : actuellement les `AriaToolCallCard` ne sont pas affichées en live (le hook `useAriaStream` n'écoute pas encore les events `tool_use`/`tool_result` SSE). Refactor : enrichir `AriaChatMessage` avec un champ `tool_calls` mis à jour par le parser SSE.
- **Historique des conversations** dans le panel : un sidebar gauche dans `AriaPanel` qui liste les conversations passées avec leur résumé, cliquables pour reprendre.
- **Stop fluide en cours de tool** : actuellement `cancel()` abort le fetch mais n'arrête pas une boucle tool_use en cours côté serveur.

### Moyen terme
- **Tools supplémentaires** :
  - `comparerScenarioFiscal` (deux régimes immo) — wrappe `calculerImpotFoncier` + `optimiseurFiscal`
  - `prevoirCashFlowMois` — calendrier dépenses/revenus sur 12 mois
  - `recommanderEnveloppe` — quelle enveloppe (PEA/AV/PER) pour les prochains versements
- **Multi-modèle** : option de basculer entre Sonnet (rapide) et Opus (réflexion profonde) au niveau de la conversation.

### Long terme
- **Memoire vectorielle** : embedding des conversations passées pour récupérer le contexte par similarité plutôt que linéaire.
- **Voix** : entrée micro + sortie TTS pour usage mobile.
- **Notifications push** : envoyer un nudge proactif même quand l'app n'est pas ouverte (alerte concentration sectorielle, opportunité fiscale détectée).

---

## 7. Phases livrées (changelog)

Voir [`ARIA_BUILD.md`](./ARIA_BUILD.md) pour le détail commit-par-commit de chaque phase :

| Phase | Date | Périmètre |
|---|---|---|
| 1 | 2026-05-18 | Fondations + contexte dynamique + route non-streaming |
| 2 | 2026-05-18 | Streaming SSE + hook `useAriaStream` |
| 3 | 2026-05-18 | Tool calls (6 tools + boucle tool_use anti-infinie) |
| 4 | 2026-05-18 | Mémoire long terme (résumés + insights persistants) |
| 5 | 2026-05-18 | Feedback loop + détection proactive (logique) |
| 6 | 2026-05-18 | Frontend complet — ARIA visible et utilisable |

Tests : ~1000 tests Vitest, couverture exhaustive sur `lib/aria/` et `app/api/aria/`.
