/**
 * Templates de reponses ARIA en mode mock. Genere du texte naturel FR
 * qui utilise les VRAIS chiffres de l'utilisateur (patrimoine, tool result).
 *
 * Aucun appel IA. Juste de la concatenation et du format euros/percent.
 */

import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

function fmtEur(v: number | null | undefined): string {
  return formatCurrency(v ?? null, 'EUR', { compact: true })
}
function fmtPct(v: number | null | undefined, decimals = 1): string {
  return v == null ? '—' : formatPercent(v, { decimals })
}

const PRENOM_FALLBACK = ''

function bonjour(p: PatrimoineComplet): string {
  return p.prenom ? `${p.prenom}, ` : PRENOM_FALLBACK
}

// ─────────────────────────────────────────────────────────────────
// Reponses TEXTE (pas de tool)
// ─────────────────────────────────────────────────────────────────

export function buildTextResponse(
  topic: 'resume' | 'profil' | 'allocation' | 'fire' | 'scores' | 'generic',
  p: PatrimoineComplet,
): string {
  switch (topic) {
    case 'resume': {
      const fire = p.projectionFIRESnapshot
      const ageFire = fire?.age_fire_median != null ? `${fire.age_fire_median} ans` : '—'
      return (
        `${bonjour(p)}voici ton patrimoine en deux phrases.\n\n` +
        `Tu pèses ${fmtEur(p.totalNet)} net (${fmtEur(p.totalBrut)} brut moins ${fmtEur(p.totalDettes)} de dettes), répartis entre ` +
        `${fmtEur(p.totalPortefeuille)} de portefeuille financier, ${fmtEur(p.totalImmoEquity)} d'équité immo et ${fmtEur(p.totalCash)} de cash. ` +
        `À ce rythme, ta date FIRE estimée est ${ageFire} ` +
        `(rendement central ${fmtPct(fire?.rendement_central_pct ?? p.rendementEstime, 1)}). ` +
        `${p.recommandations.length > 0 ? `Mon attention se porte d'abord sur : ${p.recommandations.slice(0, 2).map((r) => r.titre).join(' ; ')}.` : ''}`
      )
    }

    case 'profil': {
      const inv = p.profilType ?? 'investisseur équilibré'
      const age = p.fireInputs.age != null ? `${p.fireInputs.age} ans` : 'âge non renseigné'
      const ageCible = p.fireInputs.age_cible != null ? ` (cible ${p.fireInputs.age_cible} ans)` : ''
      return (
        `${bonjour(p)}d'après ton questionnaire, tu es un profil **${inv}** (${age}${ageCible}). ` +
        `Ton score de tolérance au risque est ${Math.round(p.fireInputs.risk_score)}/100. ` +
        // QW9 — On utilise la cible BRUTE ici (texte conversationnel "tu vises X").
        // L'utilisateur reconnaît ainsi ce qu'il a déclaré saisir. Les calculs
        // ARIA en aval (computeMetrics, projectionInputs) utilisent eux l'ajustée.
        `Tu vises un revenu passif de ${fmtEur(p.fireInputs.revenu_passif_cible)}/mois à terme. ` +
        `Tes enveloppes actives : ${p.fireInputs.enveloppes.length > 0 ? p.fireInputs.enveloppes.join(', ') : '(à compléter)'}.`
      )
    }

    case 'allocation': {
      const top3 = p.repartitionClasses.slice(0, 4).map((c) => `${c.label} ${fmtPct(c.pourcentage, 0)}`).join(' · ')
      const surExpo = p.repartitionSectorielle.find((s) => s.alerte)
      return (
        `Ton allocation par classe : ${top3}. ` +
        (surExpo
          ? `Côté sectoriel, **${surExpo.secteur}** est en surpondération à ${fmtPct(surExpo.pourcentage, 0)} (benchmark MSCI ${fmtPct(surExpo.benchmark, 0)}). C'est le premier point à rééquilibrer.`
          : `Ta diversification sectorielle est globalement alignée sur le MSCI World — rien d'urgent à rebalancer.`)
      )
    }

    case 'fire': {
      const fire = p.projectionFIRESnapshot
      if (!fire || fire.age_fire_median == null) {
        return `${bonjour(p)}je n'ai pas assez d'éléments pour calculer ta trajectoire FIRE. Complète ton âge, ton âge FIRE cible et ton revenu passif cible dans /profil — je pourrai ensuite te donner une vraie estimation.`
      }
      const cible = fire.patrimoine_fire_cible
      const progressionPct = cible > 0 ? (p.totalNet / cible) * 100 : 0
      return (
        `Sur ta trajectoire FIRE actuelle, l'**indépendance financière est estimée à ${fire.age_fire_median} ans** ` +
        `(scénario médian, rendement ${fmtPct(fire.rendement_central_pct, 1)}). ` +
        `Tu es à ${fmtPct(progressionPct, 0)} de ta cible patrimoine (${fmtEur(cible)} en €uros futurs indexés inflation). ` +
        `Avec ton DCA actuel de ${fmtEur(p.fireInputs.epargne_mensuelle)}/mois, il te manque environ ${fmtEur((cible - p.totalNet))} à constituer. ` +
        `Pour accélérer : augmente ton épargne mensuelle ou rééquilibre vers des actifs plus rentables (je peux simuler les deux).`
      )
    }

    case 'scores': {
      const s = p.scores
      const lines = [
        `Voici tes 5 scores d'intelligence patrimoniale :`,
        `• **Diversification** : ${s.diversification.value ?? '—'}/100 — ${s.diversification.label}`,
        `• **Cohérence profil** : ${s.coherence_profil.value ?? '—'}/100 — ${s.coherence_profil.label}`,
        `• **Progression FIRE** : ${s.progression_fire.value ?? '—'}/100 — ${s.progression_fire.label}`,
        `• **Solidité** : ${s.solidite.value ?? '—'}/100 — ${s.solidite.label}`,
        `• **Efficience fiscale** : ${s.efficience_fiscale.value ?? '—'}/100 — ${s.efficience_fiscale.label}`,
      ]
      const faible = Object.entries(s).find(([, v]) => v.value !== null && v.value < 50)
      if (faible) lines.push(`\nLe score le plus faible est **${faible[0].replace('_', ' ')}** — c'est ce que je travaillerais en priorité.`)
      return lines.join('\n')
    }

    case 'generic':
    default:
      return (
        `${bonjour(p)}je suis ARIA, ton assistant patrimonial. ` +
        `Je peux te résumer ton patrimoine (${fmtEur(p.totalNet)} net), te simuler un krach, ` +
        `tester un nouveau DCA, ou décortiquer un bien immo. Pose-moi une question précise.`
      )
  }
}

// ─────────────────────────────────────────────────────────────────
// Reponses TOOL : Claude formule un commentaire autour du resultat
// ─────────────────────────────────────────────────────────────────

interface ToolResult {
  ok?:     boolean
  raison?: string
}

export function buildToolCommentary(
  toolName: string,
  result: unknown,
  _p: PatrimoineComplet,
): string {
  const r = result as ToolResult & Record<string, unknown>

  if (r && r.ok === false) {
    return (
      `Le tool **${toolName}** n'a pas pu aboutir : ${r.raison ?? 'cause inconnue'}. ` +
      `Vérifie que ton profil est complet (âge, âge FIRE cible, revenu passif cible) dans /profil, puis relance la question.`
    )
  }

  switch (toolName) {
    case 'simulerStressTest': {
      const data = r as {
        scenario_label?: string
        perte_immediate_eur?: number
        patrimoine_choque_eur?: number
        age_fire_sans_stress?: number | null
        age_fire_avec_stress?: number | null
        retard_mois?: number | null
        revenu_passif_a_age_cible_eur?: number
        objectif_atteint?: boolean
      }
      const retard = data.retard_mois != null ? `${Math.round(data.retard_mois)} mois` : '—'
      return (
        `Scénario **${data.scenario_label ?? '?'}** appliqué. ` +
        `Perte immédiate estimée : **${fmtEur(data.perte_immediate_eur)}** (portefeuille tombe à ${fmtEur(data.patrimoine_choque_eur)}). ` +
        `Date FIRE : ${data.age_fire_sans_stress ?? '—'} ans sans stress → **${data.age_fire_avec_stress ?? '—'} ans avec stress** (retard ${retard}). ` +
        (data.objectif_atteint
          ? `Bonne nouvelle : ton objectif reste atteignable malgré le choc.`
          : `Attention : avec ce scénario, ta cible FIRE n'est plus atteinte. Renforcer le coussin de cash ou diversifier hors actions amortirait l'impact.`)
      )
    }

    case 'simulerNouveauDCA': {
      const data = r as {
        dca_actuel?: number
        dca_simule?: number
        age_fire_actuel?: number | null
        age_fire_simule?: number | null
        gain_en_annees?: number | null
        ecart_patrimoine_eur?: number
      }
      const gain = data.gain_en_annees ?? 0
      const verbe = gain > 0 ? 'gagnes' : gain < 0 ? 'perds' : 'restes stable sur'
      return (
        `Passer de ${fmtEur(data.dca_actuel)}/mois à **${fmtEur(data.dca_simule)}/mois**, c'est ` +
        `${Math.abs(gain).toFixed(1)} an${Math.abs(gain) >= 2 ? 's' : ''} ${verbe} ta date FIRE ` +
        `(de ${data.age_fire_actuel ?? '—'} à **${data.age_fire_simule ?? '—'} ans**). ` +
        `À l'âge cible, tu aurais ${fmtEur(data.ecart_patrimoine_eur)} de plus en patrimoine. ` +
        (gain > 1 ? `Bon levier — facile à mettre en place si ton taux d'épargne le permet.` : `Effet limité ; un rééquilibrage d'allocation pourrait être plus rentable.`)
      )
    }

    case 'simulerAcquisitionFuture': {
      const data = r as {
        acquisition?:               { prix_achat?: number; apport?: number; dans_combien_annees?: number; type?: string; loyer_brut_mensuel?: number }
        age_fire_sans_acquisition?: number | null
        age_fire_avec_acquisition?: number | null
        delta_annees?:              number | null
        delta_patrimoine_eur?:      number
      }
      const acq = data.acquisition ?? {}
      const delta = data.delta_annees ?? 0
      const sens = delta < 0 ? 'avance' : delta > 0 ? 'retarde' : 'ne change pas'
      return (
        `Acquisition simulée : un **${acq.type === 'RP' ? 'résidence principale' : 'locatif'}** de ${fmtEur(acq.prix_achat)} dans ${acq.dans_combien_annees ?? '—'} an(s), ` +
        `apport ${fmtEur(acq.apport)}, loyer brut estimé ${fmtEur(acq.loyer_brut_mensuel)}/mois. ` +
        `Cet investissement **${sens}** ta date FIRE de ${Math.abs(delta).toFixed(1)} an(s) ` +
        `(de ${data.age_fire_sans_acquisition ?? '—'} à ${data.age_fire_avec_acquisition ?? '—'} ans), ` +
        `avec un impact patrimoine de ${fmtEur(data.delta_patrimoine_eur)} à l'âge cible. ` +
        (delta < 0 ? `Levier intéressant.` : `À regarder de près : les charges et frais d'entrée peuvent rogner le bénéfice.`)
      )
    }

    case 'chercherPosition': {
      const data = r as { matches?: Array<{ nom?: string; valeur_actuelle?: number; pv_latente?: number; pv_latente_pct?: number; poids_pct?: number }> }
      const matches = data.matches ?? []
      if (matches.length === 0) return `Je n'ai trouvé aucune position correspondant à ta recherche. Vérifie le ticker ou le nom exact.`
      const lines = matches.map((m) =>
        `• **${m.nom}** : ${fmtEur(m.valeur_actuelle)} (${fmtPct(m.poids_pct ?? 0, 0)} du portefeuille), ` +
        `+/- value ${fmtEur(m.pv_latente)} (${fmtPct(m.pv_latente_pct ?? 0, 1)}).`,
      )
      return `Voici ce que j'ai trouvé :\n${lines.join('\n')}`
    }

    case 'obtenirDetailBien': {
      const data = r as {
        found?:    boolean
        bien?:     { nom?: string; ville?: string | null; valeur?: number; equity?: number; cashflow_mensuel?: number; rendement_net_pct?: number; ltv_pct?: number }
        candidates_si_ambigu?: Array<{ nom?: string; ville?: string | null }>
      }
      if (data.candidates_si_ambigu && data.candidates_si_ambigu.length > 0) {
        const list = data.candidates_si_ambigu.map((c) => `• ${c.nom}${c.ville ? ` (${c.ville})` : ''}`).join('\n')
        return `J'ai trouvé plusieurs biens qui correspondent — peux-tu préciser lequel ?\n${list}`
      }
      if (!data.found || !data.bien) return `Je n'ai pas trouvé ce bien dans ton parc immobilier.`
      const b = data.bien
      return (
        `**${b.nom}**${b.ville ? ` (${b.ville})` : ''} : valeur ${fmtEur(b.valeur)}, équité ${fmtEur(b.equity)}. ` +
        `Cashflow mensuel net ${fmtEur(b.cashflow_mensuel)}, rendement net ${fmtPct(b.rendement_net_pct ?? 0, 1)}, LTV ${fmtPct(b.ltv_pct ?? 0, 0)}. ` +
        ((b.cashflow_mensuel ?? 0) < 0
          ? `Le cashflow étant négatif, ce bien te coûte chaque mois — c'est normal en début de crédit, à surveiller dans la durée.`
          : `Bon cashflow positif — ce bien s'autofinance.`)
      )
    }

    case 'obtenirHistoriquePatrimoine': {
      const data = r as {
        ok?:           boolean
        nb_points?:    number
        jours_demandes?: number
        variation_eur?:  number | null
        variation_pct?:  number | null
        premier_point?: { date?: string; patrimoine_net?: number }
        dernier_point?: { date?: string; patrimoine_net?: number }
      }
      if (!data.ok || (data.nb_points ?? 0) === 0) {
        return `Je n'ai pas encore assez de snapshots historiques pour tracer ton évolution sur ${data.jours_demandes ?? '—'} jours. Reviens dans quelques jours, je collecte un snapshot quotidien.`
      }
      const variation = data.variation_eur ?? 0
      const sens = variation > 0 ? 'progressé' : variation < 0 ? 'reculé' : 'stable'
      return (
        `Sur les ${data.jours_demandes ?? '—'} derniers jours (${data.nb_points} snapshots), ton patrimoine net est passé de ` +
        `${fmtEur(data.premier_point?.patrimoine_net)} à **${fmtEur(data.dernier_point?.patrimoine_net)}**. ` +
        `Tu as ${sens} de ${fmtEur(Math.abs(variation))} (${fmtPct(data.variation_pct ?? 0, 1)}). ` +
        (Math.abs(variation) > 0
          ? `Tendance ${variation > 0 ? 'positive' : 'à surveiller'}.`
          : `Périmètre stable sur la période.`)
      )
    }

    default:
      return `J'ai exécuté ${toolName} mais je n'ai pas de template de commentaire pour ce résultat. Voici les données brutes : ${JSON.stringify(result).slice(0, 300)}…`
  }
}
