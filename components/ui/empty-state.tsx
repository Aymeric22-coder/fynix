import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon:        LucideIcon
  title:       string
  description: string
  action?:     React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
        <Icon size={24} className="text-muted" />
      </div>
      <p className="text-primary font-medium mb-1">{title}</p>
      <p className="text-secondary text-sm max-w-xs">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
