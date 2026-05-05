/**
 * Edge Function : snapshot-daily
 *
 * Déclenchée chaque nuit à 00:05 UTC via Supabase Cron.
 * Génère un snapshot patrimonial pour chaque utilisateur actif.
 *
 * Planification (à configurer dans Supabase Dashboard → Edge Functions → Schedule) :
 *   cron: "5 0 * * *"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

async function generateSnapshotForUser(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]!

  // 1. Actifs actifs
  const { data: assets } = await supabase
    .from('assets')
    .select('asset_type, current_value, confidence')
    .eq('user_id', userId)
    .eq('status', 'active')

  // 2. Dettes actives
  const { data: debts } = await supabase
    .from('debts')
    .select('capital_remaining')
    .eq('user_id', userId)
    .eq('status', 'active')

  // 3. Lots loués
  const { data: lots } = await supabase
    .from('real_estate_lots')
    .select('rent_amount, charges_amount, status')
    .eq('user_id', userId)
    .eq('status', 'rented')

  // Calculs par classe
  const byType: Record<string, number> = {
    real_estate: 0, scpi: 0, stock: 0, etf: 0, crypto: 0, gold: 0, cash: 0, other: 0,
  }

  for (const a of assets ?? []) {
    const v = Number(a.current_value ?? 0)
    const t = a.asset_type as string
    byType[t] = (byType[t] ?? 0) + v
  }

  const financialValue = (byType['stock'] ?? 0) + (byType['etf'] ?? 0) +
                         (byType['crypto'] ?? 0) + (byType['gold'] ?? 0)

  const totalGross = Object.values(byType).reduce((s, v) => s + v, 0)
  const totalDebt = (debts ?? []).reduce((s, d) => s + Number(d.capital_remaining ?? 0), 0)

  const monthlyCashFlow = (lots ?? []).reduce(
    (s, l) => s + Number(l.rent_amount ?? 0) - Number(l.charges_amount ?? 0),
    0,
  )

  // Score de confiance
  const highValue = (assets ?? [])
    .filter((a) => a.confidence === 'high')
    .reduce((s, a) => s + Number(a.current_value ?? 0), 0)

  const confidenceScore = totalGross > 0 ? round2((highValue / totalGross) * 100) : 0

  // Upsert — idempotent si déclenché plusieurs fois dans la journée
  const { error } = await supabase.from('patrimony_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: today,
      total_gross_value: round2(totalGross),
      total_debt: round2(totalDebt),
      total_net_value: round2(totalGross - totalDebt),
      real_estate_value: round2(byType['real_estate'] ?? 0),
      scpi_value: round2(byType['scpi'] ?? 0),
      financial_value: round2(financialValue),
      cash_value: round2(byType['cash'] ?? 0),
      other_value: round2(byType['other'] ?? 0),
      monthly_cashflow: round2(monthlyCashFlow),
      confidence_score: confidenceScore,
    },
    { onConflict: 'user_id,snapshot_date' },
  )

  if (error) {
    console.error(`[snapshot-daily] user=${userId} error:`, error.message)
  } else {
    console.log(`[snapshot-daily] user=${userId} done — net=${round2(totalGross - totalDebt)}€`)
  }
}

Deno.serve(async () => {
  try {
    // Récupérer tous les utilisateurs actifs (via profiles)
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id')

    if (error) throw error

    const userIds = (profiles ?? []).map((p) => p.id)
    console.log(`[snapshot-daily] Processing ${userIds.length} user(s)`)

    // Séquentiel pour éviter la surcharge DB
    for (const userId of userIds) {
      await generateSnapshotForUser(userId)
    }

    return new Response(
      JSON.stringify({ ok: true, users_processed: userIds.length }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[snapshot-daily] Fatal error:', e)
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
