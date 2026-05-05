// Composants de champ de formulaire réutilisables
import { cn } from '@/lib/utils/format'

const BASE = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent transition-colors'

interface FieldProps {
  label:       string
  error?:      string
  hint?:       string
  required?:   boolean
  children:    React.ReactNode
  className?:  string
}

export function Field({ label, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm text-secondary">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint  && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}
export function Input({ error, className, ...props }: InputProps) {
  return (
    <input
      className={cn(BASE, error && 'border-danger', className)}
      {...props}
    />
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  children: React.ReactNode
}
export function Select({ error, className, children, ...props }: SelectProps) {
  return (
    <select className={cn(BASE, 'cursor-pointer', error && 'border-danger', className)} {...props}>
      {children}
    </select>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}
export function Textarea({ error, className, ...props }: TextareaProps) {
  return (
    <textarea
      rows={3}
      className={cn(BASE, 'resize-none', error && 'border-danger', className)}
      {...props}
    />
  )
}

// Grille 2 colonnes responsive
export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn(
      'grid gap-4',
      cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3',
    )}>
      {children}
    </div>
  )
}

// Séparateur de section dans formulaire
export function FormSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {title && (
        <p className="text-xs text-secondary uppercase tracking-widest font-medium pt-2 border-t border-border">
          {title}
        </p>
      )}
      {children}
    </div>
  )
}
