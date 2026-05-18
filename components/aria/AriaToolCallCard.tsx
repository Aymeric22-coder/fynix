/**
 * Carte expandable pour un tool_use ARIA + son tool_result.
 * Le format du `data` est libre (JSON ARIA fourni par les executors).
 */
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, AlertCircle } from 'lucide-react'

interface AriaToolCallCardProps {
  name:    string
  input?:  unknown
  result?: unknown
  success?: boolean
}

export function AriaToolCallCard({ name, input, result, success }: AriaToolCallCardProps) {
  const [open, setOpen] = useState(false)
  const StatusIcon = success === false ? AlertCircle : CheckCircle2
  const statusClass = success === false ? 'text-danger' : 'text-accent'

  return (
    <div className="my-2 rounded-lg border border-border bg-surface-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-secondary hover:bg-surface transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} className="text-accent" />
        <span className="font-medium text-primary">{name}</span>
        {result !== undefined && (
          <StatusIcon size={12} className={`ml-auto ${statusClass}`} />
        )}
      </button>

      {open && (
        <div className="border-t border-border bg-bg px-3 py-2 space-y-2">
          {input !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-secondary mb-1">Entree</div>
              <pre className="text-[11px] font-mono text-primary overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-secondary mb-1">Resultat</div>
              <pre className="text-[11px] font-mono text-primary overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
