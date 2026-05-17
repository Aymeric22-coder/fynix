import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.spec.ts',
      // Sprint 2 : permet de tester des Route Handlers Next.js (pas .tsx,
      // pas de besoin jsdom).
      'app/**/*.test.ts',
      'app/**/*.spec.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
