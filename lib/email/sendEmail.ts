/**
 * Service d'envoi email — wrapper Resend.
 *
 * Resend (https://resend.com) : 3 000 emails/mois gratuits, intégration
 * native Next.js. La clé API est lue depuis l'env var RESEND_API_KEY.
 *
 * Garantie : aucune erreur ne remonte par exception — on retourne
 * toujours { success: boolean, error?: string }. Un email qui échoue
 * ne doit jamais bloquer l'app (notif non bloquante par design).
 */

import { Resend } from 'resend'

export const DEFAULT_FROM = 'Fynix <onboarding@resend.dev>'

export interface SendEmailParams {
  to:      string
  subject: string
  html:    string
  from?:   string
}

export interface SendEmailResult {
  success:    boolean
  error?:     string
  /** ID Resend retourné en cas de succès (utile pour le tracking). */
  messageId?: string
}

/**
 * Envoie un email via Resend. Wrapper try/catch complet — ne throw jamais.
 *
 * Si RESEND_API_KEY n'est pas configurée, retourne success=false avec
 * une erreur explicite (utile en dev local sans la clé).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[sendEmail] RESEND_API_KEY not configured — email skipped')
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from:    params.from ?? DEFAULT_FROM,
      to:      params.to,
      subject: params.subject,
      html:    params.html,
    })

    if (error) {
      console.error('[sendEmail] Resend error:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[sendEmail] Unexpected error:', message)
    return { success: false, error: message }
  }
}
