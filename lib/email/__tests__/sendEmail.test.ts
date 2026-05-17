/**
 * Tests de `sendEmail` — wrapper Resend.
 *
 * On mocke le constructeur Resend pour controler les reponses sans appel
 * reseau. Les tests verifient :
 *   - succes nominal,
 *   - 429 rate limit,
 *   - 5xx serveur,
 *   - absence de RESEND_API_KEY,
 *   - exception inattendue.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('resend', () => ({
  // Constructible via `new Resend(apiKey)` : on declare une vraie classe
  // pour que l'operateur `new` fonctionne (vi.fn() arrow ne le permet pas).
  Resend: class {
    emails = { send: sendMock }
  },
}))

import { sendEmail } from '../sendEmail'

describe('sendEmail', () => {
  const ORIGINAL_ENV = process.env.RESEND_API_KEY

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_123'
    sendMock.mockReset()
  })
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = ORIGINAL_ENV
  })

  it('appel reussi → success=true + messageId', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg-001' }, error: null })
    const r = await sendEmail({ to: 'u@ex.com', subject: 'S', html: '<p>x</p>' })
    expect(r.success).toBe(true)
    expect(r.messageId).toBe('msg-001')
  })

  it('Resend rate limit (429) → success=false + message', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests (429)' },
    })
    const r = await sendEmail({ to: 'u@ex.com', subject: 'S', html: '<p>x</p>' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/429|rate/i)
  })

  it('Resend 5xx → success=false avec message d\'erreur', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'internal_error', message: 'Service unavailable (503)' },
    })
    const r = await sendEmail({ to: 'u@ex.com', subject: 'S', html: '<p>x</p>' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('503')
  })

  it('RESEND_API_KEY absente → success=false, pas d\'appel reseau', async () => {
    delete process.env.RESEND_API_KEY
    const r = await sendEmail({ to: 'u@ex.com', subject: 'S', html: '<p>x</p>' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/RESEND_API_KEY/)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('exception inattendue (network) → catch + success=false', async () => {
    sendMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    const r = await sendEmail({ to: 'u@ex.com', subject: 'S', html: '<p>x</p>' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('ECONNRESET')
  })
})
