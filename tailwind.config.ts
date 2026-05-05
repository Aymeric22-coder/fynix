import type { Config } from 'tailwindcss'

// Tailwind v4 — les tokens de design sont définis dans globals.css via @theme.
// Ce fichier ne sert qu'à indiquer les chemins de scan du contenu.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
}

export default config
