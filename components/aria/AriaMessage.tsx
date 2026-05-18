/**
 * Bulle de message ARIA (role user ou assistant).
 *
 * - user      : bulle a droite, fond surface-2
 * - assistant : bulle a gauche, fond surface + accent border
 *   - streaming en cours : ajoute un curseur pulsant
 *   - tool_calls fournis : carte expandable (Phase 3)
 *   - message_id present : boutons 👍/👎 (Phase 5)
 */
'use client'

import { AriaToolCallCard } from './AriaToolCallCard'
import { AriaFeedbackButtons } from './AriaFeedbackButtons'

export interface AriaToolCallTrace {
  tool_use_id: string
  name:        string
  input?:      unknown
  result?:     unknown
  success?:    boolean
}

interface AriaMessageProps {
  role:        'user' | 'assistant'
  content:     string
  streaming?:  boolean
  toolCalls?:  AriaToolCallTrace[]
  messageId?:  string
}

export function AriaMessage({ role, content, streaming, toolCalls, messageId }: AriaMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[88%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 text-[11px] text-accent mb-1 font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
            ARIA
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-surface-2 text-primary border border-border'
              : 'bg-surface border border-accent/30 text-primary'
          }`}
        >
          {content}
          {streaming && (
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-accent rounded-sm align-middle animate-pulse" />
          )}
        </div>

        {toolCalls && toolCalls.length > 0 && (
          <div className="mt-1">
            {toolCalls.map((t) => (
              <AriaToolCallCard
                key={t.tool_use_id}
                name={t.name}
                input={t.input}
                result={t.result}
                success={t.success}
              />
            ))}
          </div>
        )}

        {!isUser && messageId && !streaming && (
          <AriaFeedbackButtons messageId={messageId} />
        )}
      </div>
    </div>
  )
}
