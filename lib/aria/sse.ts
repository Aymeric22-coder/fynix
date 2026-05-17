/**
 * Helpers SSE partages entre la route /api/aria/chat (cote serveur,
 * emission des frames) et le hook useAriaStream (cote client, parsing).
 *
 * Format des evenements ARIA :
 *   data: {"type":"meta", "conversation_id":"..."}\n\n
 *   data: {"type":"delta","delta":"..."}\n\n
 *   data: {"type":"done", "message_id":"...","usage":{...},"model":"..."}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 *
 * On evite volontairement le champ "event:" du protocole SSE standard
 * pour rester compatible avec `fetch + getReader` sans EventSource (qui
 * ne supporte pas les requetes POST).
 */

export interface AriaSSEMeta  { type: 'meta';  conversation_id: string }
export interface AriaSSEDelta { type: 'delta'; delta: string }
export interface AriaSSEToolUse {
  type:         'tool_use'
  tool_use_id:  string
  name:         string
  input:        unknown
}
export interface AriaSSEToolResult {
  type:        'tool_result'
  tool_use_id: string
  success:     boolean
  data:        unknown
}
export interface AriaSSEDone {
  type:        'done'
  message_id:  string
  model?:      string
  usage?:      { input_tokens: number; output_tokens: number } | null
}
export interface AriaSSEError { type: 'error'; message: string }

export type AriaSSEEvent =
  | AriaSSEMeta | AriaSSEDelta | AriaSSEToolUse | AriaSSEToolResult
  | AriaSSEDone | AriaSSEError

/**
 * Encode un payload en une frame SSE prete a etre envoyee dans le stream.
 * Format : "data: <json>\n\n".
 */
export function encodeSSEFrame(payload: AriaSSEEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * Parse une frame SSE (texte sans le separateur \n\n final) et renvoie
 * l'evenement ARIA correspondant. Tolere les lignes vides et plusieurs
 * lignes `data:` dans la meme frame (les concatene).
 *
 * Renvoie null si la frame ne contient pas de json valide.
 */
export function parseSSEFrame(frame: string): AriaSSEEvent | null {
  const dataLines = frame.split('\n')
    .map((l) => l.trimStart())
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart())
  if (dataLines.length === 0) return null
  const payload = dataLines.join('\n')
  try {
    const parsed = JSON.parse(payload) as AriaSSEEvent
    if (!isValidEvent(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isValidEvent(o: unknown): o is AriaSSEEvent {
  if (!o || typeof o !== 'object') return false
  const t = (o as { type?: unknown }).type
  return t === 'meta' || t === 'delta' || t === 'done' || t === 'error'
      || t === 'tool_use' || t === 'tool_result'
}

/**
 * Parser de flux : avale des chunks de bytes (decodes en string),
 * accumule un buffer interne, et appelle `onEvent` chaque fois qu'une
 * frame complete (terminee par \n\n) est detectee.
 *
 * Utilisable cote client (dans useAriaStream) et cote test (pour
 * consommer un ReadableStream en bytes -> events typees).
 */
export function createSSEParser(onEvent: (evt: AriaSSEEvent) => void) {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const evt = parseSSEFrame(frame)
        if (evt) onEvent(evt)
        sep = buffer.indexOf('\n\n')
      }
    },
    /** Force le flush du buffer restant (utile en fin de stream). */
    flush() {
      if (buffer.trim().length > 0) {
        const evt = parseSSEFrame(buffer)
        if (evt) onEvent(evt)
        buffer = ''
      }
    },
  }
}
