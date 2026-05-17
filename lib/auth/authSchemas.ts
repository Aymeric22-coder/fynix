/**
 * Schémas Zod pour les routes /api/auth/* (Sprint 2 — D15).
 */
import { z } from 'zod'

const passwordRule = z.string().min(6, 'Minimum 6 caracteres')

export const LoginBodySchema = z.object({
  email:    z.string().email('Adresse email invalide'),
  /** Optionnel : si absent → magic link. */
  password: z.string().min(1).optional(),
})
export type LoginBody = z.infer<typeof LoginBodySchema>

export const SignupBodySchema = z.object({
  email:           z.string().email('Adresse email invalide'),
  password:        passwordRule,
  /** Verifiee aussi cote client, mais on revalide cote serveur. */
  confirmPassword: z.string().optional(),
}).refine(
  (data) => !data.confirmPassword || data.confirmPassword === data.password,
  { message: 'Les mots de passe ne correspondent pas', path: ['confirmPassword'] },
)
export type SignupBody = z.infer<typeof SignupBodySchema>
