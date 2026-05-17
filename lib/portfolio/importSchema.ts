/**
 * Schémas Zod pour les bodies des routes d'import.
 *
 * Sprint 2 — D15 : avant, `parseBody<T>` était un simple cast TS sans
 * validation runtime. Un client pouvait envoyer `excludedIds: 'oops'`
 * (string au lieu d'array) → undefined behaviour. Maintenant, échec clair
 * 400 avec liste d'erreurs.
 */
import { z } from 'zod'

/** Body JSON de POST /api/portfolio/import. */
export const ImportCsvBodySchema = z.object({
  csv:          z.string().min(1).optional(),
  broker:       z.string().optional(),
  excludedIds:  z.array(z.string()).optional(),
  /** Compat legacy : ancien nom du champ. */
  _exclusions:  z.array(z.string()).optional(),
})
export type ImportCsvBody = z.infer<typeof ImportCsvBodySchema>

/**
 * Aplatit les erreurs Zod en messages courts type "path: code".
 * Utilise pour renvoyer 400 a l'UI sans fuiter de details internes.
 */
export function formatZodErrors(err: z.ZodError): string[] {
  return err.issues.map((iss) => {
    const path = iss.path.length > 0 ? iss.path.join('.') : '(racine)'
    return `${path} : ${iss.message}`
  })
}
