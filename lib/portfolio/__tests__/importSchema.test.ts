import { describe, it, expect } from 'vitest'
import { ImportCsvBodySchema, formatZodErrors } from '../importSchema'
import { LoginBodySchema, SignupBodySchema } from '@/lib/auth/authSchemas'

describe('ImportCsvBodySchema', () => {
  it('body valide → parse OK', () => {
    const r = ImportCsvBodySchema.safeParse({
      csv: 'a;b\n1;2', broker: 'generic', excludedIds: ['ISIN1', 'ISIN2'],
    })
    expect(r.success).toBe(true)
  })

  it('body vide → parse OK (tout est optionnel)', () => {
    expect(ImportCsvBodySchema.safeParse({}).success).toBe(true)
  })

  it('excludedIds en string au lieu d\'array → echec lisible', () => {
    const r = ImportCsvBodySchema.safeParse({ excludedIds: 'oops' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = formatZodErrors(r.error)
      expect(msgs.some((m) => m.includes('excludedIds'))).toBe(true)
    }
  })

  it('formatZodErrors aplatit les paths imbriques', () => {
    const r = ImportCsvBodySchema.safeParse({ excludedIds: [123] })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = formatZodErrors(r.error)
      expect(msgs.length).toBeGreaterThan(0)
      expect(msgs[0]).toContain('excludedIds')
    }
  })
})

describe('LoginBodySchema', () => {
  it('email + password → OK', () => {
    expect(LoginBodySchema.safeParse({
      email: 'test@example.com', password: 'secret',
    }).success).toBe(true)
  })

  it('email seul (magic link) → OK', () => {
    expect(LoginBodySchema.safeParse({
      email: 'test@example.com',
    }).success).toBe(true)
  })

  it('email manquant → echec', () => {
    const r = LoginBodySchema.safeParse({ password: 'secret' })
    expect(r.success).toBe(false)
  })

  it('email mal forme → echec', () => {
    const r = LoginBodySchema.safeParse({ email: 'not-an-email' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(formatZodErrors(r.error)[0]).toContain('Adresse email invalide')
    }
  })
})

describe('SignupBodySchema', () => {
  it('email + password 6+ → OK', () => {
    expect(SignupBodySchema.safeParse({
      email: 'test@example.com', password: 'secret',
    }).success).toBe(true)
  })

  it('password 5 chars → echec', () => {
    const r = SignupBodySchema.safeParse({
      email: 'test@example.com', password: '12345',
    })
    expect(r.success).toBe(false)
  })

  it('confirmPassword non identique → echec', () => {
    const r = SignupBodySchema.safeParse({
      email: 'test@example.com', password: 'secret', confirmPassword: 'autre',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = formatZodErrors(r.error)
      expect(msgs.some((m) => m.includes('confirmPassword'))).toBe(true)
    }
  })

  it('confirmPassword identique → OK', () => {
    expect(SignupBodySchema.safeParse({
      email: 'test@example.com', password: 'secret', confirmPassword: 'secret',
    }).success).toBe(true)
  })
})
