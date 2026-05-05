import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface BaseProps {
  variant?:   Variant
  size?:      Size
  icon?:      LucideIcon
  iconRight?: LucideIcon
  loading?:   boolean
  children?:  React.ReactNode
  className?: string
}

// Surcharge : rendu <a> via Next/Link quand href est fourni
type ButtonProps =
  | (BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (BaseProps & { href: string; disabled?: boolean })

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-accent hover:bg-accent-hover text-white',
  secondary: 'bg-surface-2 hover:bg-border text-primary border border-border',
  ghost:     'text-secondary hover:text-primary hover:bg-surface-2',
  danger:    'bg-danger-muted hover:bg-danger/20 text-danger border border-danger/30',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

export function Button(props: ButtonProps) {
  const {
    variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight,
    loading, children, className, href, disabled,
  } = props

  const baseClass = cn(
    'inline-flex items-center justify-center font-medium rounded-lg',
    'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    (disabled || loading) && 'opacity-50 pointer-events-none',
    className,
  )

  const inner = (
    <>
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : Icon && <Icon size={size === 'sm' ? 13 : 15} className="flex-shrink-0" />
      }
      {children}
      {IconRight && !loading && <IconRight size={size === 'sm' ? 13 : 15} className="flex-shrink-0" />}
    </>
  )

  if (href) {
    return <Link href={href} className={baseClass}>{inner}</Link>
  }

  const { href: _h, ...rest } = props as ButtonProps & { href?: string }
  return (
    <button
      disabled={disabled || loading}
      className={baseClass}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {inner}
    </button>
  )
}
