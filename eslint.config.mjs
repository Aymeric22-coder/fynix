import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Sprint 2 — D2 : ignore les fichiers auto-generes que Next.js ecrit
    // a chaque dev/build et qu'on ne controle pas (triple-slash directives).
    ignores: [
      'next-env.d.ts',
      '.next/**',
      'node_modules/**',
      'tsconfig.tsbuildinfo',
    ],
  },
  {
    rules: {
      // Autorise les variables préfixées _ non utilisées (pattern courant)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Pas d'obligation d'utiliser <Image> de Next partout
      '@next/next/no-img-element': 'off',
    },
  },
]

export default eslintConfig
