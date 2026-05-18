/**
 * Construit le system prompt injecte dans Claude a chaque message.
 *
 * Le prompt est intentionnellement structure en sections texte simples
 * (pas de markdown lourd) : c'est ce que Claude consomme le mieux pour
 * extraire les chiffres et raisonner dessus. Toutes les valeurs sont
 * formatees via `formatEur` / `formatPercent` pour rester coherent
 * avec le reste de l'app.
 *
 * Le prompt s'organise en 6 blocs :
 *   1. Identite et comportement d'ARIA
 *   2. Concepts FIRE de reference (regle 25x, SWR, PRU, DCA)
 *   3. Donnees temps reel de l'utilisateur (tous les chiffres)
 *   4. Alertes actives
 *   5. Actions recentes
 *   6. Contexte UI (section active)
 */

import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'
import type {
  AriaActionRecente, AriaAlerte, AriaBien, AriaCompteCash, AriaLiveContext,
  AriaPastConversation, AriaPersistentInsight, AriaPosition, AriaRepartitionLine,
} from './types'

// ─────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────

function fmtEur(v: number | null | undefined): string {
  return formatCurrency(v ?? null, 'EUR')
}

function fmtEurCompact(v: number | null | undefined): string {
  return formatCurrency(v ?? null, 'EUR', { compact: true })
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return '—'
  return formatPercent(v, { decimals })
}

function fmtAge(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v)} ans`
}

function fmtYesNo(b: boolean): string {
  return b ? 'oui' : 'non'
}

// ─────────────────────────────────────────────────────────────────
// Sections du prompt
// ─────────────────────────────────────────────────────────────────

function sectionIdentite(): string {
  return [
    'ROLE',
    'Tu es ARIA, l\'assistant patrimonial IA de FYNIX — une app francaise de pilotage patrimonial et de trajectoire FIRE.',
    '',
    'COMPORTEMENT',
    '- Reponds toujours en francais, ton chaleureux et expert (pas commercial).',
    '- Sois concis : 2-4 phrases en moyenne, jamais de longs paragraphes.',
    '- Cite les chiffres reels de l\'utilisateur (extraits des sections ci-dessous) plutot que de generaliser.',
    '- Quand tu evoques un montant ou un pourcentage, formate-le proprement (ex: 12 450 € ou 4,2 %).',
    '- Si l\'utilisateur pose une question dont la reponse n\'est pas dans les donnees, dis-le franchement plutot que d\'inventer.',
    '- Ne propose pas de produits financiers nommes. Donne des grandes orientations (classes d\'actif, enveloppes fiscales, niveaux de risque).',
    '- N\'invente JAMAIS un calcul ; si la donnee est absente, dis "donnees insuffisantes" ou propose a l\'utilisateur de la renseigner.',
  ].join('\n')
}

function sectionConcepts(): string {
  return [
    'CONCEPTS FIRE DE REFERENCE',
    '- Regle des 25x / SWR 4 % : pour vivre de Y€/an de revenu passif, il faut un patrimoine financier d\'environ 25 × Y.',
    '- Lean FIRE / Fat FIRE : SWR plus conservateur (3 a 3,5 %) si l\'horizon depasse 35 ans ou si securite recherchee.',
    '- PRU : prix de revient unitaire moyen d\'une position (utilise pour calculer la +/- value latente).',
    '- DCA (Dollar Cost Averaging) : achat regulier d\'un meme montant, lisse le point d\'entree.',
    '- LTV : loan-to-value = capital_restant / valeur du bien (en %).',
    '- Cash-flow : loyer - mensualite - charges/12. Peut etre negatif en debut de credit (effet de levier).',
  ].join('\n')
}

function fmtRepartition(rep: AriaRepartitionLine[]): string {
  if (rep.length === 0) return '  (aucune)'
  return rep.map((r) => `  - ${r.label} : ${fmtPct(r.pourcentage, 1)}`).join('\n')
}

function fmtPosition(p: AriaPosition): string {
  return `  - ${p.nom} [${p.ticker}] : ${fmtEur(p.valeur_actuelle)} | PRU ${fmtEur(p.pru)} | +/- ${fmtEur(p.pv_latente)} (${fmtPct(p.pv_latente_pct)})`
}

function fmtBien(b: AriaBien): string {
  const ville = b.ville ? ` (${b.ville})` : ''
  return [
    `  - ${b.nom}${ville} [${b.type}]`,
    `      valeur ${fmtEurCompact(b.valeur)} | equity ${fmtEurCompact(b.equity)} | LTV ${fmtPct(b.ltv_pct, 0)} | levier ${b.niveau_levier}`,
    `      loyer ${fmtEur(b.loyer_mensuel)}/mois | cashflow ${fmtEur(b.cashflow_mensuel)}/mois | rdt net ${fmtPct(b.rendement_net_pct)}`,
  ].join('\n')
}

function fmtCompteCash(c: AriaCompteCash): string {
  return `  - ${c.nom} [${c.type}] : ${fmtEur(c.solde)}`
}

function sectionDonnees(ctx: AriaLiveContext): string {
  const { profil, patrimoine, portefeuille, immo, cash, fire, scores } = ctx
  const prenomLine = profil.prenom ? `Utilisateur : ${profil.prenom}` : 'Utilisateur : (prenom non renseigne)'

  const parts: string[] = []

  parts.push('DONNEES TEMPS REEL DE L\'UTILISATEUR')
  parts.push(`Snapshot genere le ${formatDate(ctx.generated_at, 'medium')}.`)
  parts.push('')

  // ── Profil ──
  parts.push('[Profil]')
  parts.push(prenomLine)
  parts.push(`Age : ${fmtAge(profil.age)} | Age FIRE cible : ${fmtAge(profil.age_fire_cible)}`)
  parts.push(`Type d\'investisseur : ${profil.type_investisseur ?? '—'} | tolerance risque ${profil.tolerance_risque !== null ? `${Math.round(profil.tolerance_risque)}/100` : '—'}`)
  parts.push(`Revenu passif objectif : ${fmtEur(profil.revenu_passif_objectif)}/mois | TMI ${profil.tmi_rate !== null ? fmtPct(profil.tmi_rate * 100, 0) : '—'}`)
  parts.push('')

  // ── Patrimoine ──
  parts.push('[Patrimoine global]')
  parts.push(`Brut ${fmtEurCompact(patrimoine.brut)} | Net ${fmtEurCompact(patrimoine.net)} | Dettes ${fmtEurCompact(patrimoine.dettes)}`)
  parts.push(`Evolution 30j : ${fmtPct(patrimoine.evolution_30j_pct)} | 90j : ${fmtPct(patrimoine.evolution_90j_pct)}`)
  parts.push('')

  // ── Portefeuille ──
  parts.push('[Portefeuille financier]')
  parts.push(`Valeur totale ${fmtEurCompact(portefeuille.valeur_totale)} | +/- value latente ${fmtEur(portefeuille.pv_latente_totale)} | ${portefeuille.nb_positions} positions`)
  parts.push('Top 3 par valeur :')
  if (portefeuille.top_3_par_valeur.length > 0) {
    portefeuille.top_3_par_valeur.forEach((p) => parts.push(fmtPosition(p)))
  } else {
    parts.push('  (aucune position)')
  }
  parts.push('Repartition par classe :')
  parts.push(fmtRepartition(portefeuille.repartition_classes))
  parts.push('Repartition sectorielle (top) :')
  parts.push(fmtRepartition(portefeuille.repartition_secteurs))
  parts.push('Repartition geographique (top) :')
  parts.push(fmtRepartition(portefeuille.repartition_geo))
  parts.push('')

  // ── Immo ──
  parts.push('[Immobilier]')
  parts.push(`${immo.nb_biens} bien(s) | valeur brute ${fmtEurCompact(immo.valeur_brute_totale)} | equity ${fmtEurCompact(immo.equity_totale)} | credit restant ${fmtEurCompact(immo.credit_total_restant)}`)
  parts.push(`Loyers annuels totaux ${fmtEurCompact(immo.loyers_annuels_totaux)} | rdt net moyen ${fmtPct(immo.rendement_net_moyen_pct)} | revenu passif net ${fmtEur(immo.revenu_passif_mensuel)}/mois`)
  if (immo.biens.length > 0) {
    parts.push('Biens :')
    immo.biens.forEach((b) => parts.push(fmtBien(b)))
  }
  parts.push('')

  // ── Cash ──
  parts.push('[Cash]')
  parts.push(`Total ${fmtEurCompact(cash.total)} | mois de precaution couverts : ${cash.mois_precaution !== null ? cash.mois_precaution.toFixed(1) : '—'} | cash excessif : ${fmtYesNo(cash.cash_excessif)}`)
  if (cash.comptes.length > 0) {
    parts.push('Comptes :')
    cash.comptes.forEach((c) => parts.push(fmtCompteCash(c)))
  }
  parts.push('')

  // ── FIRE ──
  parts.push('[Trajectoire FIRE]')
  parts.push(`Cible patrimoine : ${fmtEurCompact(fire.cible_patrimoine)} | progression : ${fmtPct(fire.progression_pct, 0)} | ecart : ${fmtEurCompact(fire.ecart_objectif_eur)}`)
  parts.push(`Age FIRE estime (median) : ${fmtAge(fire.age_fire_estime)} | optimiste ${fmtAge(fire.age_fire_optimiste)} | pessimiste ${fmtAge(fire.age_fire_pessimiste)}`)
  parts.push(`Annees restantes (median) : ${fire.annees_restantes !== null ? `${fire.annees_restantes.toFixed(1)} ans` : '—'} | revenu passif actuel : ${fmtEur(fire.revenu_passif_actuel)}/mois`)
  parts.push('')

  // ── Scores ──
  parts.push('[Scores d\'intelligence /100]')
  const fmtScore = (key: string, s: { value: number | null; niveau: string; label: string }) =>
    `  - ${key} : ${s.value !== null ? Math.round(s.value) : '—'} (${s.niveau} — ${s.label})`
  parts.push(fmtScore('Diversification', scores.diversification))
  parts.push(fmtScore('Coherence profil', scores.coherence_profil))
  parts.push(fmtScore('Progression FIRE', scores.progression_fire))
  parts.push(fmtScore('Solidite', scores.solidite))
  parts.push(fmtScore('Efficience fiscale', scores.efficience_fiscale))

  return parts.join('\n')
}

function sectionAlertes(alertes: AriaAlerte[]): string {
  if (alertes.length === 0) {
    return ['ALERTES ACTIVES', 'Aucune alerte active.'].join('\n')
  }
  const lines = ['ALERTES ACTIVES']
  alertes.slice(0, 8).forEach((a) => {
    const action = a.action_suggeree ? ` → ${a.action_suggeree}` : ''
    lines.push(`- [${a.type.toUpperCase()} | ${a.categorie}] ${a.message}${action}`)
  })
  return lines.join('\n')
}

function sectionActions(actions: AriaActionRecente[]): string {
  if (actions.length === 0) {
    return ['ACTIONS RECENTES', '(aucune action recente enregistree)'].join('\n')
  }
  const lines = ['ACTIONS RECENTES']
  actions.slice(0, 10).forEach((a) => {
    lines.push(`- ${formatDate(a.date, 'short')} [${a.type}] ${a.description}`)
  })
  return lines.join('\n')
}

function sectionConversationsPassees(convs: AriaPastConversation[]): string {
  if (convs.length === 0) {
    return ['HISTORIQUE DES CONVERSATIONS PASSEES', '(premiere conversation ou aucun resume disponible)'].join('\n')
  }
  const lines = ['HISTORIQUE DES CONVERSATIONS PASSEES (3 dernieres resumes)']
  for (const c of convs) {
    lines.push(`- ${formatDate(c.last_message_at, 'short')} : ${c.summary}`)
  }
  return lines.join('\n')
}

function sectionInsightsPersistants(insights: AriaPersistentInsight[]): string {
  if (insights.length === 0) {
    return ['INSIGHTS UTILISATEUR PERSISTANTS', '(aucun insight enregistre)'].join('\n')
  }
  const lines = ['INSIGHTS UTILISATEUR PERSISTANTS (top 5, observe sur les conversations precedentes)']
  for (const i of insights) {
    const conf = Math.round(i.confidence * 100)
    lines.push(`- [${i.type} · ${conf}% confiance] ${i.insight}`)
  }
  return lines.join('\n')
}

function sectionUI(ctx: AriaLiveContext): string {
  const { ui } = ctx
  const lines = ['SECTION UI ACTIVE']
  lines.push(`Section : ${ui.section ?? '—'}`)
  if (ui.page_url) lines.push(`Page : ${ui.page_url}`)
  if (ui.derniere_action_chrono) lines.push(`Derniere action visible : ${ui.derniere_action_chrono}`)
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────
// Point d'entree
// ─────────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: AriaLiveContext): string {
  return [
    sectionIdentite(),
    '',
    sectionConcepts(),
    '',
    sectionDonnees(ctx),
    '',
    sectionAlertes(ctx.alertes),
    '',
    sectionActions(ctx.actions_recentes),
    '',
    sectionConversationsPassees(ctx.conversations_passees ?? []),
    '',
    sectionInsightsPersistants(ctx.insights_persistants ?? []),
    '',
    sectionUI(ctx),
  ].join('\n')
}
