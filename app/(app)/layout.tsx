import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import Sidebar from '@/components/shared/sidebar'
import { PageTransition } from '@/components/shared/page-transition'
import { AriaLauncher } from '@/components/aria/AriaLauncher'
import { AriaErrorBoundary } from '@/components/aria/AriaErrorBoundary'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="relative flex h-screen overflow-hidden bg-bg bg-data-grid">
      {/* Halo radial premium — décoratif, non interactif */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 40% at 50% -10%, rgb(var(--accent-rgb) / 0.06) 0%, transparent 60%)',
        }}
      />
      <Sidebar />
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <AriaErrorBoundary>
        <AriaLauncher />
      </AriaErrorBoundary>
    </div>
  )
}
