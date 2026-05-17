/**
 * Tests des helpers SSE partages route/hook.
 * Logique pure, pas d'I/O.
 */
import { describe, it, expect, vi } from 'vitest'
import { encodeSSEFrame, parseSSEFrame, createSSEParser, type AriaSSEEvent } from '../sse'

describe('encodeSSEFrame', () => {
  it('encode un meta event au format SSE', () => {
    const bytes = encodeSSEFrame({ type: 'meta', conversation_id: 'conv-1' })
    const txt = new TextDecoder().decode(bytes)
    expect(txt).toBe('data: {"type":"meta","conversation_id":"conv-1"}\n\n')
  })

  it('encode un delta event', () => {
    const bytes = encodeSSEFrame({ type: 'delta', delta: 'Bonjour' })
    const txt = new TextDecoder().decode(bytes)
    expect(txt.startsWith('data: ')).toBe(true)
    expect(txt.endsWith('\n\n')).toBe(true)
    expect(txt).toContain('"delta":"Bonjour"')
  })

  it('echappe les caracteres JSON speciaux', () => {
    const bytes = encodeSSEFrame({ type: 'delta', delta: 'A\nB"C' })
    const txt = new TextDecoder().decode(bytes)
    expect(txt).toContain('A\\nB\\"C')
    // Pas de vrai newline au milieu du payload (sinon casse le protocole SSE)
    const body = txt.slice(6, -2)              // strip "data: " et "\n\n"
    expect(body.includes('\n')).toBe(false)
  })
})

describe('parseSSEFrame', () => {
  it('parse un meta event', () => {
    const evt = parseSSEFrame('data: {"type":"meta","conversation_id":"abc"}')
    expect(evt).toEqual({ type: 'meta', conversation_id: 'abc' })
  })

  it('parse un delta event', () => {
    const evt = parseSSEFrame('data: {"type":"delta","delta":"Hello"}')
    expect(evt).toEqual({ type: 'delta', delta: 'Hello' })
  })

  it('parse un done event avec usage', () => {
    const evt = parseSSEFrame('data: {"type":"done","message_id":"m1","model":"claude","usage":{"input_tokens":10,"output_tokens":20}}')
    expect(evt).toMatchObject({ type: 'done', message_id: 'm1', model: 'claude' })
  })

  it('parse un error event', () => {
    const evt = parseSSEFrame('data: {"type":"error","message":"boom"}')
    expect(evt).toEqual({ type: 'error', message: 'boom' })
  })

  it('renvoie null si pas de ligne data:', () => {
    expect(parseSSEFrame('event: foo')).toBeNull()
    expect(parseSSEFrame('')).toBeNull()
  })

  it('renvoie null si payload JSON invalide', () => {
    expect(parseSSEFrame('data: pas du json')).toBeNull()
  })

  it('renvoie null si type inconnu (defense en profondeur)', () => {
    expect(parseSSEFrame('data: {"type":"hack","x":1}')).toBeNull()
  })

  it('tolere les espaces apres data:', () => {
    const evt = parseSSEFrame('data:   {"type":"meta","conversation_id":"abc"}')
    expect(evt).toEqual({ type: 'meta', conversation_id: 'abc' })
  })

  it('concatene plusieurs lignes data: dans une meme frame', () => {
    // Cas conformement au spec SSE : data: lignes successives
    const evt = parseSSEFrame('data: {"type":"delta",\ndata: "delta":"Hello"}')
    expect(evt).toEqual({ type: 'delta', delta: 'Hello' })
  })
})

describe('createSSEParser', () => {
  it('emet un event quand une frame complete arrive', () => {
    const events: AriaSSEEvent[] = []
    const parser = createSSEParser((e) => events.push(e))

    parser.push('data: {"type":"meta","conversation_id":"c1"}\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'meta', conversation_id: 'c1' })
  })

  it('emet plusieurs events si plusieurs frames dans un chunk', () => {
    const events: AriaSSEEvent[] = []
    const parser = createSSEParser((e) => events.push(e))

    parser.push([
      'data: {"type":"delta","delta":"A"}\n\n',
      'data: {"type":"delta","delta":"B"}\n\n',
      'data: {"type":"delta","delta":"C"}\n\n',
    ].join(''))
    expect(events).toHaveLength(3)
    expect(events.map((e) => (e.type === 'delta' ? e.delta : '?'))).toEqual(['A', 'B', 'C'])
  })

  it('rassemble un event qui arrive en plusieurs chunks (mid-payload)', () => {
    const events: AriaSSEEvent[] = []
    const parser = createSSEParser((e) => events.push(e))

    parser.push('data: {"type":"de')
    parser.push('lta","delta":"He')
    parser.push('llo"}\n')
    expect(events).toHaveLength(0)              // pas encore complet
    parser.push('\n')                            // termine la frame
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'delta', delta: 'Hello' })
  })

  it('gere la separation \\n\\n au milieu d\'un chunk', () => {
    const events: AriaSSEEvent[] = []
    const parser = createSSEParser((e) => events.push(e))

    parser.push('data: {"type":"delta","delta":"A"}\n\ndata: {"type":"delta","delta":"B"}\n\n')
    expect(events).toHaveLength(2)
  })

  it('ignore les frames vides entre evenements', () => {
    const events: AriaSSEEvent[] = []
    const parser = createSSEParser((e) => events.push(e))
    parser.push('\n\ndata: {"type":"meta","conversation_id":"c"}\n\n\n\n')
    expect(events).toHaveLength(1)
  })

  it('flush() vide le buffer restant si frame partielle', () => {
    const events: AriaSSEEvent[] = []
    const parser = createSSEParser((e) => events.push(e))
    parser.push('data: {"type":"meta","conversation_id":"c"}')   // pas de \n\n final
    expect(events).toHaveLength(0)
    parser.flush()
    expect(events).toHaveLength(1)
  })

  it('flush() est un no-op si buffer vide', () => {
    const onEvent = vi.fn()
    const parser = createSSEParser(onEvent)
    parser.push('data: {"type":"meta","conversation_id":"c"}\n\n')
    onEvent.mockClear()
    parser.flush()
    expect(onEvent).not.toHaveBeenCalled()
  })
})

describe('roundtrip encode -> parse', () => {
  const cases: AriaSSEEvent[] = [
    { type: 'meta',  conversation_id: 'abc-123' },
    { type: 'delta', delta: 'Bonjour Aymeric, ton patrimoine net est de 156,9 k €.' },
    { type: 'done',  message_id: 'msg-1', model: 'claude-sonnet-4', usage: { input_tokens: 100, output_tokens: 50 } },
    { type: 'error', message: 'Boom: erreur reseau' },
  ]
  for (const evt of cases) {
    it(`roundtrip ${evt.type}`, () => {
      const bytes = encodeSSEFrame(evt)
      const txt = new TextDecoder().decode(bytes)
      // Strip le suffixe \n\n pour parseSSEFrame qui prend une frame "nue"
      const frame = txt.replace(/\n\n$/, '')
      expect(parseSSEFrame(frame)).toEqual(evt)
    })
  }
})
