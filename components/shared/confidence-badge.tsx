import { Badge } from '@/components/ui/badge'
import type { ConfidenceLevel } from '@/types/database.types'

const MAP: Record<ConfidenceLevel, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
  high:   { label: 'Fiable',   variant: 'success' },
  medium: { label: 'Estimé',   variant: 'warning' },
  low:    { label: 'Incertain', variant: 'danger'  },
}

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const { label, variant } = MAP[level]
  return <Badge variant={variant}>{label}</Badge>
}
