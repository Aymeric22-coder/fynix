/**
 * Detection d'intent basique pour le mode mock ARIA.
 *
 * On lit le dernier message utilisateur et on devine quel tool appeler
 * (ou aucun = reponse texte directe) en fonction de keywords FR.
 *
 * Pas d'IA ici — juste de la regex et du score lexical. Suffit pour
 * une demo UX realiste sans frais API.
 */

import type { PatrimoineComplet } from '@/types/analyse'
import { SCENARIOS_STRESS } from '@/lib/analyse/stressTest'

export type MockToolName =
  | 'simulerStressTest'
  | 'simulerNouveauDCA'
  | 'simulerAcquisitionFuture'
  | 'chercherPosition'
  | 'obtenirDetailBien'
  | 'obtenirHistoriquePatrimoine'

export type MockIntent =
  | { kind: 'tool'; tool: MockToolName; input: Record<string, unknown> }
  | { kind: 'text'; topic: 'resume' | 'profil' | 'allocation' | 'fire' | 'scores' | 'generic' }

/** Normalise une string FR pour comparaison : minuscules + sans accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Cherche le 1er nombre dans la string (entier ou decimal, FR ou EN). */
function extractNumber(s: string): number | null {
  const m = s.match(/(-?\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1]!.replace(',', '.'))
  return isFinite(n) ? n : null
}

/**
 * Detecte le scenario de stress evoque par l'utilisateur.
 * Fallback : crash_marches (le plus parlant pour une demo).
 */
function detectStressScenario(text: string): string {
  const t = normalize(text)
  if (t.includes('vacance') || t.includes('locataire') || t.includes('loyer impaye')) return 'vacance_locative'
  if (t.includes('chomage') || t.includes('perte emploi') || t.includes('licenc')) return 'perte_emploi'
  if (t.includes('inflation')) return 'inflation_forte'
  if (t.includes('taux')) return 'hausse_taux'
  if (t.includes('catastrophe') || t.includes('double')) return 'double_peine'
  return 'crash_marches'
}

export function detectIntent(userText: string, p: PatrimoineComplet): MockIntent {
  const t = normalize(userText)

  // Stress test — krach, crash, stress, scenario, krash, chute
  if (/(krach|krash|crash|stress|catastrophe|chute|baisse)/.test(t)
   || /perte d.emploi|vacance|inflation|hausse des taux/.test(t)) {
    const scenarioId = detectStressScenario(t)
    // Verifie que le scenario existe
    const known = SCENARIOS_STRESS.find((s) => s.id === scenarioId)
    return { kind: 'tool', tool: 'simulerStressTest', input: { scenario_id: known?.id ?? 'crash_marches' } }
  }

  // DCA — epargne, dca, mensualite epargne, augmenter
  if (/\bdca\b/.test(t) || /epargne (mensuel|augment)/.test(t) || /augment.*(epargne|dca|versement)/.test(t)) {
    const n = extractNumber(userText)
    const defaultDca = Math.max(100, (p.fireInputs.epargne_mensuelle ?? 500) + 500)
    return {
      kind: 'tool',
      tool: 'simulerNouveauDCA',
      input: { nouveau_dca_mensuel: n && n > 50 ? n : defaultDca },
    }
  }

  // Acquisition future — achete, acquisi, appartement, immeuble dans X ans
  if (/(achet|acqui).*\b(appart|maison|immeub|locatif|bien|rp)\b/.test(t)
   || /(appart|maison|immeub|locatif).*(achet|acqui|dans \d+ an)/.test(t)) {
    const prix = extractNumber(userText) ?? 200_000
    return {
      kind: 'tool',
      tool: 'simulerAcquisitionFuture',
      input: {
        prix_achat:          prix,
        apport:              Math.round(prix * 0.2),
        dans_combien_annees: 3,
        type:                'locatif',
        loyer_brut_mensuel:  Math.round(prix * 0.005),
        duree_credit_ans:    20,
        taux_interet:        3.5,
      },
    }
  }

  // Chercher position — "où en est", "ma position", "combien j'ai en", "[ticker]"
  if (/ou en est|ma position|combien.*\b(en|sur|de)\b|combien.*\bj'ai\b/.test(t)
   || /\b(apple|aapl|lvmh|microsoft|msft|tesla|tsla|amazon|nvidia|nvda|world|etf|btc|bitcoin|eth)\b/.test(t)) {
    // Extract le query — derniere "entite" mentionnee, fallback "etf" ou top position
    const tickers = ['lvmh', 'apple', 'aapl', 'microsoft', 'msft', 'tesla', 'tsla', 'amazon', 'nvidia', 'nvda', 'world', 'etf', 'btc', 'bitcoin', 'eth']
    const found = tickers.find((tick) => t.includes(tick))
    return {
      kind: 'tool',
      tool: 'chercherPosition',
      input: { query: found ?? (p.positions[0]?.name ?? 'etf') },
    }
  }

  // Detail bien — "detail bien", "mon bien a [ville]", "mon appart de"
  if (/(detail|infos?).*bien|mon (bien|appart|immeuble|appartement)/.test(t)) {
    // Cherche un nom de ville dans le texte parmi les biens du user
    const villes = p.biens.map((b) => b.ville).filter(Boolean) as string[]
    const found = villes.find((v) => t.includes(normalize(v)))
    return {
      kind: 'tool',
      tool: 'obtenirDetailBien',
      input: { query: found ?? (p.biens[0]?.nom ?? '') },
    }
  }

  // Historique patrimoine — "evolution", "depuis quand", "historique", "courbe"
  if (/(evolution|historique|depuis|sur \d+ jours?|courbe|progression du patrimoine)/.test(t)) {
    const n = extractNumber(userText)
    return {
      kind: 'tool',
      tool: 'obtenirHistoriquePatrimoine',
      input: { jours: n && n > 0 ? Math.min(120, n) : 90 },
    }
  }

  // ──────────────────────────────────────────────────────
  // Texte direct : choix du topic
  // ──────────────────────────────────────────────────────

  if (/resume|presente|recap|synthese|fais.le point|fais un point/.test(t)) {
    return { kind: 'text', topic: 'resume' }
  }
  if (/score|diversification|solidite|coherence|efficience/.test(t)) {
    return { kind: 'text', topic: 'scores' }
  }
  if (/repartition|allocation|secteur|geo|geographie/.test(t)) {
    return { kind: 'text', topic: 'allocation' }
  }
  if (/\bfire\b|independance|liberte financiere|trajectoire/.test(t)) {
    return { kind: 'text', topic: 'fire' }
  }
  if (/profil|qui suis|investisseur/.test(t)) {
    return { kind: 'text', topic: 'profil' }
  }

  return { kind: 'text', topic: 'generic' }
}
