/**
 * Template HTML du rapport patrimonial mensuel envoyé par email.
 *
 * Contraintes des clients mail :
 *   - Inline styles uniquement (pas de <style>, pas de classes,
 *     Gmail/Outlook ignorent les feuilles externes)
 *   - HTML tables pour le layout (la majorité des clients ne supportent
 *     pas flexbox/grid de manière fiable)
 *   - Pas d'images externes pour démarrer (CSP / blocage Gmail)
 *   - Largeur max 600 px, police system-ui
 *
 * Le template ne contient AUCUNE logique métier — il reçoit des données
 * prêtes à afficher (déjà formatées en €, % etc.).
 */

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export interface MonthlyReportData {
  prenom:                          string
  mois_annee:                      string   // "Mai 2026"
  patrimoine_net:                  number
  patrimoine_net_mois_precedent:   number
  evolution_mois_eur:              number
  evolution_mois_pct:              number
  progression_fire_pct:            number   // 0..100
  age_fire_projete_median:         number
  age_fire_cible:                  number
  revenu_passif_actuel:            number
  revenu_passif_cible:             number
  actions_du_mois:                 Array<{ titre: string; detail: string }>
  repartition:                     Array<{ label: string; pct: number; valeur: number; color?: string }>
  meilleure_performance:           { nom: string; gain_pct: number } | null
  url_app:                         string
  url_desinscription:              string
}

// ─────────────────────────────────────────────────────────────────
// Constantes design (cohérent avec la palette app)
// ─────────────────────────────────────────────────────────────────

const COLORS = {
  bg:         '#0a0a0a',
  surface:    '#111111',
  surface2:   '#161616',
  border:     '#222222',
  primary:    '#f4f4f5',
  secondary:  '#a1a1aa',
  muted:      '#71717a',
  accent:     '#10b981',
  danger:     '#ef4444',
  warning:    '#f59e0b',
  gold:       '#E8B84B',
} as const

/** Couleurs par classe d'actif pour les barres de répartition. */
const COLOR_BY_LABEL: Record<string, string> = {
  Actions:        '#38bdf8',
  'ETF / Fonds':  '#10b981',
  Crypto:         '#a855f7',
  Immobilier:     '#E8B84B',
  Cash:           '#71717a',
  Obligataire:    '#3b82f6',
  Métaux:         '#f59e0b',
  SCPI:           '#fb923c',
}

// ─────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────

/** Formate un montant en € avec espaces fines insécables (compatible mail). */
function formatEur(n: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 0
  const abs = Math.abs(n)
  const rounded = abs.toFixed(decimals)
  const [int, dec] = rounded.split('.')
  const intSpaces = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = n < 0 ? '−' : (opts.sign && n > 0 ? '+' : '')
  return `${sign}${intSpaces}${dec ? ',' + dec : ''} €`
}

function formatPct(n: number, opts: { sign?: boolean } = {}): string {
  const sign = n < 0 ? '−' : (opts.sign && n > 0 ? '+' : '')
  return `${sign}${Math.abs(n).toFixed(1)} %`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

export function generateMonthlyReportHTML(data: MonthlyReportData): string {
  const isPositif    = data.evolution_mois_eur >= 0
  const couleurDelta = isPositif ? COLORS.accent : COLORS.danger
  const pctFire      = Math.max(0, Math.min(100, data.progression_fire_pct))

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FIRECORE — Rapport ${escapeHtml(data.mois_annee)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};color:${COLORS.primary};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <!-- Wrapper centré 600px -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">

          ${renderHeader(data)}
          ${renderHero(data, couleurDelta, isPositif)}
          ${renderFireProgress(data, pctFire)}
          ${renderActions(data)}
          ${renderRepartition(data)}
          ${renderMeilleurePerformance(data)}
          ${renderCTA(data)}
          ${renderFooter(data)}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────
// Sections du template
// ─────────────────────────────────────────────────────────────────

function renderHeader(data: MonthlyReportData): string {
  return `
  <tr>
    <td style="padding:24px 28px 20px;border-bottom:1px solid ${COLORS.border};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <div style="font-size:16px;font-weight:700;letter-spacing:0.18em;color:${COLORS.primary};">FIRECORE</div>
            <div style="font-size:12px;color:${COLORS.accent};margin-top:6px;letter-spacing:0.06em;">
              Votre rapport patrimonial — ${escapeHtml(data.mois_annee)}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function renderHero(data: MonthlyReportData, couleurDelta: string, isPositif: boolean): string {
  const flecheDelta = isPositif ? '↑' : '↓'
  return `
  <tr>
    <td style="padding:28px;">
      <p style="margin:0 0 4px;font-size:14px;color:${COLORS.secondary};">
        Bonjour ${escapeHtml(data.prenom || 'investisseur')} 👋
      </p>
      <p style="margin:0 0 6px;font-size:12px;color:${COLORS.muted};letter-spacing:0.08em;text-transform:uppercase;">
        Patrimoine net
      </p>
      <div style="font-size:36px;font-weight:700;color:${COLORS.primary};line-height:1.1;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;">
        ${formatEur(data.patrimoine_net)}
      </div>
      <div style="margin-top:10px;font-size:14px;color:${couleurDelta};font-variant-numeric:tabular-nums;">
        ${flecheDelta} ${formatEur(data.evolution_mois_eur, { sign: true })}
        <span style="color:${COLORS.muted};">(${formatPct(data.evolution_mois_pct, { sign: true })})</span>
        <span style="color:${COLORS.muted};">ce mois-ci</span>
      </div>
    </td>
  </tr>`
}

function renderFireProgress(data: MonthlyReportData, pctFire: number): string {
  const ecart      = data.age_fire_projete_median - data.age_fire_cible
  const ecartText  = ecart === 0
    ? `Objectif aligné à ${data.age_fire_cible} ans`
    : ecart < 0
    ? `${Math.abs(ecart)} an${Math.abs(ecart) > 1 ? 's' : ''} d'avance sur votre objectif (${data.age_fire_cible} ans)`
    : `${ecart} an${ecart > 1 ? 's' : ''} de retard sur votre objectif (${data.age_fire_cible} ans)`
  const ecartColor = ecart <= 0 ? COLORS.accent : COLORS.warning

  return `
  <tr>
    <td style="padding:0 28px 24px;">
      <div style="background:${COLORS.surface2};border:1px solid ${COLORS.border};border-radius:8px;padding:18px;">
        <div style="font-size:12px;color:${COLORS.muted};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">
          Votre trajectoire vers l&rsquo;indépendance
        </div>
        <!-- Barre de progression -->
        <div style="background:${COLORS.border};border-radius:999px;height:8px;overflow:hidden;margin:8px 0 10px;">
          <div style="background:${COLORS.accent};height:8px;width:${pctFire.toFixed(1)}%;border-radius:999px;"></div>
        </div>
        <div style="font-size:13px;color:${COLORS.primary};font-variant-numeric:tabular-nums;">
          <strong>${pctFire.toFixed(0)} %</strong>
          <span style="color:${COLORS.muted};">de l'objectif atteint</span>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
          <tr>
            <td style="font-size:12px;color:${COLORS.muted};">Indépendance projetée</td>
            <td align="right" style="font-size:13px;color:${COLORS.primary};font-variant-numeric:tabular-nums;">
              ${data.age_fire_projete_median} ans
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;color:${COLORS.muted};padding-top:4px;">Revenu passif</td>
            <td align="right" style="font-size:13px;color:${COLORS.primary};padding-top:4px;font-variant-numeric:tabular-nums;">
              ${formatEur(data.revenu_passif_actuel)}/m
              <span style="color:${COLORS.muted};font-size:11px;">sur ${formatEur(data.revenu_passif_cible)}/m visés</span>
            </td>
          </tr>
        </table>
        <div style="margin-top:10px;font-size:11px;color:${ecartColor};">
          ${escapeHtml(ecartText)}
        </div>
      </div>
    </td>
  </tr>`
}

function renderActions(data: MonthlyReportData): string {
  if (data.actions_du_mois.length === 0) {
    return `
  <tr>
    <td style="padding:0 28px 24px;">
      <div style="background:${COLORS.surface2};border:1px solid ${COLORS.border};border-radius:8px;padding:18px;text-align:center;">
        <div style="font-size:14px;color:${COLORS.accent};">🎯 Tout est en ordre ce mois-ci</div>
        <div style="font-size:12px;color:${COLORS.muted};margin-top:6px;">Pas d'action prioritaire détectée — continuez sur votre trajectoire.</div>
      </div>
    </td>
  </tr>`
  }

  const items = data.actions_du_mois.map((a, i) => `
    <tr>
      <td style="padding:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
          <tr>
            <td style="background:${COLORS.surface2};border-left:3px solid ${COLORS.accent};border-radius:6px;padding:12px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top" width="28" style="padding-right:10px;">
                    <div style="background:${COLORS.bg};border:1px solid ${COLORS.accent};border-radius:999px;width:22px;height:22px;line-height:22px;text-align:center;font-size:12px;color:${COLORS.accent};font-weight:700;">
                      ${i + 1}
                    </div>
                  </td>
                  <td valign="top">
                    <div style="font-size:13px;color:${COLORS.primary};font-weight:600;">${escapeHtml(a.titre)}</div>
                    <div style="font-size:12px;color:${COLORS.secondary};margin-top:3px;line-height:1.5;">${escapeHtml(a.detail)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('')

  return `
  <tr>
    <td style="padding:0 28px 12px;">
      <div style="font-size:12px;color:${COLORS.muted};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">
        Vos ${data.actions_du_mois.length} action${data.actions_du_mois.length > 1 ? 's' : ''} de ce mois
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${items}
      </table>
    </td>
  </tr>`
}

function renderRepartition(data: MonthlyReportData): string {
  if (data.repartition.length === 0) return ''

  const total = data.repartition.reduce((s, r) => s + r.valeur, 0) || 1
  const rows = data.repartition.slice(0, 8).map((r) => {
    const color = r.color ?? COLOR_BY_LABEL[r.label] ?? COLORS.muted
    const barPct = Math.max(2, Math.min(100, (r.valeur / total) * 100))
    return `
      <tr>
        <td style="padding:8px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="110" style="font-size:12px;color:${COLORS.secondary};vertical-align:middle;">${escapeHtml(r.label)}</td>
              <td style="vertical-align:middle;padding:0 10px;">
                <div style="background:${COLORS.border};border-radius:999px;height:6px;width:100%;overflow:hidden;">
                  <div style="background:${color};height:6px;width:${barPct.toFixed(1)}%;border-radius:999px;"></div>
                </div>
              </td>
              <td width="50" align="right" style="font-size:12px;color:${COLORS.primary};font-variant-numeric:tabular-nums;vertical-align:middle;">${r.pct.toFixed(1)} %</td>
              <td width="80" align="right" style="font-size:12px;color:${COLORS.muted};font-variant-numeric:tabular-nums;vertical-align:middle;">${formatEur(r.valeur)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `
  }).join('')

  return `
  <tr>
    <td style="padding:12px 28px 8px;">
      <div style="font-size:12px;color:${COLORS.muted};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">
        Répartition actuelle
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows}
      </table>
    </td>
  </tr>`
}

function renderMeilleurePerformance(data: MonthlyReportData): string {
  const mp = data.meilleure_performance
  if (!mp) return ''
  return `
  <tr>
    <td style="padding:8px 28px 12px;">
      <div style="background:${COLORS.surface2};border:1px solid ${COLORS.accent};border-radius:8px;padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <div style="font-size:12px;color:${COLORS.muted};letter-spacing:0.06em;text-transform:uppercase;">🏆 Meilleure performance ce mois</div>
              <div style="font-size:14px;color:${COLORS.primary};margin-top:4px;font-weight:600;">${escapeHtml(mp.nom)}</div>
            </td>
            <td align="right">
              <div style="font-size:20px;color:${COLORS.accent};font-weight:700;font-variant-numeric:tabular-nums;">
                ${formatPct(mp.gain_pct, { sign: true })}
              </div>
            </td>
          </tr>
        </table>
      </div>
    </td>
  </tr>`
}

function renderCTA(data: MonthlyReportData): string {
  return `
  <tr>
    <td align="center" style="padding:20px 28px 28px;">
      <a href="${escapeHtml(data.url_app)}"
         style="display:inline-block;background:${COLORS.accent};color:#000000;text-decoration:none;font-size:14px;font-weight:600;padding:14px 28px;border-radius:8px;">
        Voir mon tableau de bord complet →
      </a>
    </td>
  </tr>`
}

function renderFooter(data: MonthlyReportData): string {
  return `
  <tr>
    <td style="padding:20px 28px 24px;border-top:1px solid ${COLORS.border};background:${COLORS.bg};">
      <div style="font-size:11px;color:${COLORS.muted};line-height:1.6;text-align:center;">
        <strong style="color:${COLORS.secondary};">FIRECORE</strong> — Votre copilote patrimonial<br>
        <a href="${escapeHtml(data.url_desinscription)}"
           style="color:${COLORS.muted};text-decoration:underline;">
          Ne plus recevoir ces emails
        </a>
      </div>
      <div style="font-size:10px;color:${COLORS.muted};line-height:1.5;margin-top:12px;text-align:center;">
        ⚠ Ces informations sont à titre indicatif et ne constituent pas un conseil
        en investissement au sens de la réglementation AMF.
      </div>
    </td>
  </tr>`
}
