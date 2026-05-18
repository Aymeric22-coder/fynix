# FIRECORE

App de pilotage patrimonial + indépendance financière (FR). Voir [CLAUDE.md](./CLAUDE.md) pour la vision produit et le détail de l'architecture.

## Démarrage rapide

```bash
npm install        # installe les deps + active les hooks Husky (script `prepare`)
npm run dev        # serveur Next.js sur http://localhost:3000
```

## Scripts utiles

| Commande           | Effet                                              |
|--------------------|----------------------------------------------------|
| `npm run dev`      | Dev server Next.js                                 |
| `npm run build`    | Build production (ESLint actif, échoue sur erreur) |
| `npm test`         | Vitest une fois (~9 s, 765+ tests)                 |
| `npm run test:watch` | Vitest en watch                                 |
| `npm run typecheck`| `tsc --noEmit`                                     |
| `npm run lint`     | `next lint`                                        |

## Développement

### Hooks Git (Husky + lint-staged)

L'install via `npm install` active automatiquement les hooks Git grâce au script `prepare`. Aucune action manuelle requise.

- **`pre-commit`** : `lint-staged` lance `eslint --max-warnings 0` sur les fichiers `.ts`/`.tsx` modifiés. Bloque le commit si une erreur ou un warning est présent.
- **`pre-push`** : `tsc --noEmit` + `vitest run`. Bloque le push si le typecheck échoue ou si un test casse.

### Bypass d'urgence

```bash
git push --no-verify   # ⚠ utiliser uniquement en cas de hotfix critique
```

Toute utilisation de `--no-verify` doit être justifiée dans la PR (raison technique précise) et un follow-up doit corriger les checks ignorés.

### Standards qualité

- TypeScript strict avec `noUncheckedIndexedAccess`.
- ESLint actif en build (`next.config.ts` n'ignore plus les erreurs).
- Logique métier dans `lib/`, composants `components/` purement présentationnels.
- Constantes fiscales centralisées dans `lib/analyse/constants.ts`.
- Helpers communs : `lib/utils/format.ts`, `lib/utils/devLog.ts`, `lib/utils/api.ts`.

### Tests

Vitest restreint aux modules métier et aux Route Handlers (pas de jsdom requis) :

```
include: ['lib/**/*.test.ts', 'lib/**/*.spec.ts', 'app/**/*.test.ts', 'app/**/*.spec.ts']
```

Pour rajouter un test composant nécessitant le DOM, ajouter le glob dans `vitest.config.ts` et installer `@testing-library/react` + un environnement `jsdom`.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — vision produit, stack, conventions.
- [AUDIT_FIXES.md](./AUDIT_FIXES.md) — historique des audits et des fixes (Sprints 0-2).
- [NEXT_ACTIONS.md](./NEXT_ACTIONS.md) — décisions produit en attente et opérations à programmer.
