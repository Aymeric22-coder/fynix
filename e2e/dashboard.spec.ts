/**
 * V2.5 — Suite e2e minimale (3 tests, ~30 s en local).
 *
 * Objectif : filet anti-régression silencieuse type V1.4-BIS où la suite
 * Vitest passait mais la page Server Component n'affichait pas le nouveau
 * pipeline. Pas une couverture exhaustive — juste un canari.
 *
 * **Auth (option c du brief)** : ce sprint ne teste PAS le rendu complet
 * du Dashboard derrière une session authentifiée. On valide :
 *   1. La page publique `/login` rend (HTML reçu, mots-clés présents).
 *   2. `/dashboard` redirige vers `/login` quand l'utilisateur n'a pas
 *      de session (vérifie que le middleware d'auth Next.js est cohérent).
 *   3. Aucune chaîne aberrante (« 132 026 369 », `asset:`, `CAGR`) n'apparaît
 *      sur la page publique — interdit le retour des bugs V1 dans n'importe
 *      quel rendu serveur.
 *
 * Tests authentifiés derrière un `storageState` ou un seed dédié : différés
 * à un futur sprint (l'infra Playwright est posée, il restera juste à
 * peupler `e2e/.auth/storageState.json`).
 */
import { test, expect } from '@playwright/test'

test.describe('Public pages — V2.5 smoke', () => {
  test('/login rend le formulaire d\'authentification', async ({ page }) => {
    const res = await page.goto('/login')
    expect(res?.status() ?? 200).toBeLessThan(400)
    // Champs attendus du formulaire login Fynix.
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('/dashboard sans session → redirection vers /login', async ({ page }) => {
    // Le middleware Next.js intercepte les routes protégées. Sans cookie
    // de session Supabase, l'utilisateur doit être redirigé.
    await page.goto('/dashboard')
    // On vérifie l'URL finale (Playwright suit la redirection par défaut).
    await page.waitForURL(/\/login(\?|$)/, { timeout: 10_000 })
    expect(page.url()).toMatch(/\/login/)
  })

  test('aucun chiffre aberrant ni clé d\'allocation V1 dans le rendu /login', async ({ page }) => {
    // V1.4-BIS — Le CAGR a affiché « +132 026 369,70 % ». V1.2 P0.6 — Le
    // donut affichait `asset:real_estate`. Ces chaînes ne doivent JAMAIS
    // refaire surface, même dans un rendu inattendu. La page /login est
    // une bonne sentinelle : si elle contient ça, c'est qu'on a un bug
    // de chaîne de fabrication serveur (ex: pollution du layout).
    await page.goto('/login')
    const html = await page.content()
    expect(html).not.toContain('132 026 369')
    expect(html).not.toContain('132026369')
    expect(html).not.toContain('asset:real_estate')
    expect(html).not.toContain('class:asset_type')
    // Le terme « CAGR » a été remplacé par « Croissance patrimoine » en V1.3.
    // Une réapparition signalerait une régression du label KPI.
    expect(html).not.toContain('CAGR')
  })
})
