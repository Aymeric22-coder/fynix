import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Force la revalidation du Router Cache cote client a chaque navigation.
    // Sans ca, Next mettait en cache les segments dynamiques 30s et statiques
    // 5min -> apres un deploiement, l'utilisateur voyait l'ancienne version
    // jusqu'a un hard refresh (Ctrl+F5). Reduit a 0 pour les segments
    // dynamiques (data user), garde un petit cache (30s) pour le statique.
    staleTimes: { dynamic: 0, static: 30 },
  },
  // Yahoo Finance uses Node.js APIs — mark as external for Edge compatibility
  // pdfkit aussi : il charge les fonts AFM via require runtime (fichiers .afm)
  // qui ne sont pas tree-shake-ables. Le marquer external garantit que Vercel
  // resout le module a partir de node_modules sans tenter de le bundle.
  serverExternalPackages: ['yahoo-finance2', 'pdfkit'],

  // Force l'inclusion des fichiers de fonts AFM de pdfkit dans le bundle
  // Vercel (sinon le runtime serverless renvoie ENOENT sur Helvetica.afm).
  outputFileTracingIncludes: {
    '/api/real-estate/*/export-pdf': ['./node_modules/pdfkit/js/data/**/*'],
  },
  // Sprint 2 — D2 : ESLint actif en build. 0 erreur, warnings restent
  // pour signal (unused vars, debug). Le build echoue sur les erreurs.
  // En-tetes HTTP : empeche les navigateurs et CDN intermediaires de cacher
  // les pages applicatives (au-dela du JS asset hashe que Vercel gere bien).
  // Garantit qu'un nouveau deploiement est immediatement visible sans devoir
  // forcer un Ctrl+F5 cote utilisateur.
  async headers() {
    return [
      {
        // Toutes les pages applicatives (HTML SSR) — pas les assets statiques.
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
