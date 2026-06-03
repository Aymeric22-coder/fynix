/**
 * Playwright config — V2.5 ST2.
 *
 * Suite e2e minimale pour blinder contre les régressions silencieuses
 * type V1.4-BIS (où Vitest passait mais la page Server Component
 * n'affichait pas le nouveau pipeline). Cf. leçon documentée
 * `feedback_pre_deploy_check.md` (mémoire user).
 *
 * **Périmètre V2.5** : routes publiques + redirect /dashboard → /login.
 * Tests authentifiés (rendu complet du Dashboard) déférés à un futur
 * sprint qui posera un `storageState` ou un user de seed dédié.
 *
 * **Auth retenue (option c du brief)** : on saute l'auth pour ce sprint.
 * Les 3 tests valident :
 *   1. /login (page publique) rend les éléments clés du formulaire
 *   2. /dashboard sans session → redirection vers /login
 *   3. Aucun chiffre aberrant n'apparaît dans le HTML de /login
 *      (filet anti-régression de chaîne render → string).
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:       './e2e',
  fullyParallel: true,
  forbidOnly:    !!process.env.CI,
  // V2.5 — 1 retry local, 2 en CI (le HMR Next.js peut induire des micro-flakes).
  retries:       process.env.CI ? 2 : 1,
  workers:       process.env.CI ? 1 : undefined,
  reporter:      'list',

  use: {
    // En local : http://localhost:3000 (next dev). En CI / prod-like : surchargeable.
    baseURL:    process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    video:      'off',
    screenshot: 'only-on-failure',
  },

  // V2.5 — `next dev` est lancé en arrière-plan par Playwright si
  // `PLAYWRIGHT_BASE_URL` n'est PAS fourni. Sinon on suppose que la cible
  // (ex: URL preview Vercel) est déjà disponible.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:           'npm run dev',
        url:               'http://localhost:3000/login',
        reuseExistingServer: !process.env.CI,
        timeout:           120_000,
      },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],
})
