import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  // Yahoo Finance uses Node.js APIs — mark as external for Edge compatibility
  serverExternalPackages: ['yahoo-finance2'],
  // Ignore ESLint errors during production build (apostrophes françaises, unused vars)
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
