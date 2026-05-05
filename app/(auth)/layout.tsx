export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <span className="text-3xl font-bold tracking-tight text-primary">
            FY<span className="text-accent">NIX</span>
          </span>
          <p className="mt-2 text-sm text-secondary">Pilotage patrimonial</p>
        </div>
        {children}
      </div>
    </div>
  )
}
