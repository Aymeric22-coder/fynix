import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'FYNIX', template: '%s — FYNIX' },
  description: 'Pilotage patrimonial holistique',
  robots: 'noindex,nofollow',  // application privée
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-bg text-primary antialiased`}>
        {children}
      </body>
    </html>
  )
}
