/**
 * Tests du template HTML du rapport mensuel.
 *
 * Pas de snapshot dur (le HTML evolue souvent) — on verifie des proprietes
 * stables : presence du prenom, du patrimoine, du lien unsubscribe, absence
 * d'undefined/NaN, gestion de la section actions vide.
 */
import { describe, it, expect } from 'vitest'
import {
  generateMonthlyReportHTML,
  type MonthlyReportData,
} from '../templates/monthly-report'

function makeData(over: Partial<MonthlyReportData> = {}): MonthlyReportData {
  return {
    prenom:                        'Aymeric',
    mois_annee:                    'Mai 2026',
    patrimoine_net:                123_456,
    patrimoine_net_mois_precedent: 120_000,
    evolution_mois_eur:            3456,
    evolution_mois_pct:            2.88,
    progression_fire_pct:          42.5,
    age_fire_projete_median:       55,
    age_fire_cible:                60,
    revenu_passif_actuel:          800,
    revenu_passif_cible:           3000,
    revenu_passif_cible_foyer_label: '',   // QW9-bis — pas d'ajustement famille par défaut
    actions_du_mois: [
      { titre: 'Rebalancer 5 000 €', detail: 'ETF → Obligataire' },
    ],
    repartition: [
      { label: 'ETF / Fonds', pct: 60, valeur: 74_000 },
      { label: 'Cash',        pct: 40, valeur: 49_456 },
    ],
    meilleure_performance: { nom: 'IWDA', gain_pct: 12.3 },
    url_app:                'https://fynix-mu.vercel.app',
    url_desinscription:     'https://fynix-mu.vercel.app/api/email/unsubscribe?token=TOK-123',
    ...over,
  }
}

describe('generateMonthlyReportHTML', () => {
  it('contient le prenom de l\'user', () => {
    const html = generateMonthlyReportHTML(makeData({ prenom: 'Alice' }))
    expect(html).toContain('Alice')
  })

  it('contient le patrimoine net formate en EUR', () => {
    const html = generateMonthlyReportHTML(makeData({ patrimoine_net: 123456 }))
    // 123 456 (avec espace insecable ou normal)
    expect(html.replace(/\s/g, ' ')).toMatch(/123 ?456/)
    expect(html).toContain('€')
  })

  it('contient le lien d\'unsubscribe avec le token', () => {
    const data = makeData({
      url_desinscription: 'https://x.com/u?token=ABC-456',
    })
    const html = generateMonthlyReportHTML(data)
    expect(html).toContain('https://x.com/u?token=ABC-456')
    expect(html).toMatch(/ne plus recevoir|d.sinscri|unsubscribe/i)
  })

  it('aucun undefined ou NaN dans le HTML rendu', () => {
    const html = generateMonthlyReportHTML(makeData())
    expect(html).not.toMatch(/undefined/i)
    expect(html).not.toMatch(/\bNaN\b/)
  })

  it('actions vides → message "Tout est en ordre" remplace la liste', () => {
    const html = generateMonthlyReportHTML(makeData({ actions_du_mois: [] }))
    expect(html).toMatch(/tout est en ordre/i)
    // Pas d'item de liste vide (li sans contenu, dl sans dd, etc.)
    expect(html).not.toMatch(/<li>\s*<\/li>/)
  })

  it('robuste a meilleure_performance null', () => {
    const html = generateMonthlyReportHTML(makeData({ meilleure_performance: null }))
    expect(html).not.toMatch(/undefined/i)
    expect(html).not.toMatch(/\bNaN\b/)
  })

  it('evolution negative → signe correctement formate', () => {
    const html = generateMonthlyReportHTML(makeData({
      evolution_mois_eur: -1500, evolution_mois_pct: -1.2,
    }))
    expect(html).not.toMatch(/undefined/i)
    // Selon le format, "−1 500" (moins unicode) ou "-1 500"
    expect(html).toMatch(/[−-]\s?1\s?500/)
  })
})
