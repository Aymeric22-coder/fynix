import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    // Environnement par défaut : node (rapide, pas de DOM). Les fichiers de
    // test React passent en environnement jsdom via le pragma de tête de
    // fichier `/* @vitest-environment jsdom */` (ou `// @vitest-environment jsdom`).
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.spec.ts',
      // Route Handlers Next.js (Sprint 2)
      'app/**/*.test.ts',
      'app/**/*.spec.ts',
      // Composants React (Quick Wins) — chaque fichier doit déclarer
      // `/* @vitest-environment jsdom */` en première ligne.
      'components/**/*.test.tsx',
      'components/**/*.test.ts',
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
