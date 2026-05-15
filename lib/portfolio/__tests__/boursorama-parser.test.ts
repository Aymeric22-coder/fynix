import { describe, it, expect } from 'vitest'
import { parseBoursoramaHtml } from '../providers/boursorama'

describe('parseBoursoramaHtml — extraction prix Boursorama', () => {
  it('parse le format réel observé en prod (FR0011871110)', () => {
    // HTML extrait du retour réel /api/debug/boursorama?q=FR0011871110
    // Format 2024 : data-ist-last sans valeur, prix dans le contenu
    const html = `
      <div>
        <span class="c-instrument c-instrument--last" data-ist-last>99,09</span>
      </div>
      <div class="u-color-stream-up">
        <span class="c-instrument c-instrument--variation" data-ist-variation>+1,03%</span>
      </div>
    `
    const result = parseBoursoramaHtml(html)
    expect(result).not.toBeNull()
    expect(result!.price).toBeCloseTo(99.09, 2)
    expect(result!.currency).toBe('EUR')
  })

  it('extrait la devise quand explicitement présente', () => {
    const html = `
      <span class="c-instrument c-instrument--last" data-ist-last>123,45</span>
      <span class="c-instrument c-instrument--currency">USD</span>
    `
    const result = parseBoursoramaHtml(html)
    expect(result?.price).toBeCloseTo(123.45, 2)
    expect(result?.currency).toBe('USD')
  })

  it('gère un prix avec séparateur de milliers (espaces)', () => {
    const html = `<span class="c-instrument c-instrument--last">1 234,56</span>`
    const result = parseBoursoramaHtml(html)
    expect(result?.price).toBeCloseTo(1234.56, 2)
  })

  it('renvoie null si pas de prix trouvé', () => {
    const html = `<div>Aucun prix ici</div>`
    expect(parseBoursoramaHtml(html)).toBeNull()
  })

  it('renvoie null sur prix invalide', () => {
    const html = `<span class="c-instrument c-instrument--last">0</span>`
    // Pattern réclame [.,] donc "0" ne matche pas → null
    expect(parseBoursoramaHtml(html)).toBeNull()
  })

  it('format ancien data-ist-last="VALEUR" (legacy fallback)', () => {
    const html = `<span data-ist-last="42.10">42,10</span>`
    const result = parseBoursoramaHtml(html)
    expect(result?.price).toBeCloseTo(42.10, 2)
  })

  it('parse une fiche SCPI avec structure c-list-info__value (format reel)', () => {
    // Format réel observé sur /immobilier/scpi/cours/SCPI88960069800019/ pour Iroko Zen
    // (verifié via /api/debug/scpi-trace en production)
    const html = `
      <li class="no-gutter">
        <p class="c-list-info__heading">
          Prix de souscription 2025
        </p>
        <p class="c-list-info__value u-text-size-lg">
          204 EUR
        </p>
      </li>
    `
    const result = parseBoursoramaHtml(html)
    expect(result).not.toBeNull()
    expect(result!.price).toBe(204)
    expect(result!.currency).toBe('EUR')
  })

  it('SCPI : ignore widgets sidebar (c-instrument--last des autres titres)', () => {
    // Page SCPI avec un widget sidebar contenant le cours du CAC 40 ou autre
    // Le parser SCPI doit IGNORER c-instrument--last et cibler c-list-info__value
    const html = `
      <aside>
        <span class="c-instrument c-instrument--last">109,45</span>
      </aside>
      <div class="c-faceplate">
        <p class="c-list-info__heading">Prix de souscription 2025</p>
        <p class="c-list-info__value">204 EUR</p>
      </div>
    `
    const result = parseBoursoramaHtml(html)
    expect(result?.price).toBe(204)  // PAS 109,45 (widget sidebar)
  })

  it('SCPI : ignore "Prix de souscription" tout seul (sans nombre EUR à coté)', () => {
    const html = `<p class="c-list-info__heading">Prix de souscription</p><p>Autre info</p>`
    const result = parseBoursoramaHtml(html)
    expect(result).toBeNull()
  })
})
