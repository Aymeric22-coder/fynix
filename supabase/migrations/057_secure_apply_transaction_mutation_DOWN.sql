-- =============================================================================
-- DOWN Migration 057 — restaure le corps de apply_transaction_mutation (état 056)
-- =============================================================================
-- Restaure la logique d'appartenance de la 056 (comparaison à p_user_id) si la
-- 057 devait casser l'édition de transactions. Volontairement, les privilèges
-- NE sont PAS remis à PUBLIC/anon : l'exposition anonyme était une faille, et
-- le seul appelant (client de session, rôle authenticated) reste autorisé.
-- =============================================================================

create or replace function public.apply_transaction_mutation(
  p_user_id     uuid,
  p_tx_id       uuid,
  p_op          text,     -- 'update' | 'delete'
  p_position_id uuid,
  p_new_qty     numeric,
  p_new_pru     numeric,
  p_tx          jsonb,    -- champs à écrire (update) ; ignoré si delete
  p_pnl         jsonb     -- [{ id, realized_pnl }] pour toutes les lignes restantes
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_pos   jsonb;
  v_item  jsonb;
begin
  -- ── Garde-fou d'appartenance (défense en profondeur) ──
  select user_id into v_owner from transactions where id = p_tx_id;
  if v_owner is null then
    raise exception 'TX_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner <> p_user_id then
    raise exception 'TX_NOT_OWNED' using errcode = '42501';
  end if;

  -- ── 1. Mutation de la transaction cible ──
  if p_op = 'delete' then
    delete from transactions
     where id = p_tx_id and user_id = p_user_id;

  elsif p_op = 'update' then
    update transactions set
      quantity     = case when p_tx ? 'quantity'    then (p_tx->>'quantity')::numeric    else quantity    end,
      unit_price   = case when p_tx ? 'unit_price'  then (p_tx->>'unit_price')::numeric  else unit_price  end,
      fees         = case when p_tx ? 'fees'        then (p_tx->>'fees')::numeric        else fees        end,
      amount       = case when p_tx ? 'amount'      then (p_tx->>'amount')::numeric      else amount      end,
      currency     = case when p_tx ? 'currency'    then  p_tx->>'currency'              else currency    end,
      executed_at  = case when p_tx ? 'executed_at' then (p_tx->>'executed_at')::timestamptz else executed_at end,
      label        = case when p_tx ? 'label'       then  p_tx->>'label'                 else label       end,
      notes        = case when p_tx ? 'notes'       then  p_tx->>'notes'                 else notes       end,
      -- réinitialisé puis reposé par la boucle p_pnl (contrainte sale-only)
      realized_pnl = null
     where id = p_tx_id and user_id = p_user_id;

  else
    raise exception 'BAD_OP: %', p_op using errcode = '22023';
  end if;

  -- ── 2. Position = source de vérité ──
  update positions
     set quantity = p_new_qty, average_price = p_new_pru
   where id = p_position_id and user_id = p_user_id;

  -- ── 3. realized_pnl ligne par ligne ──
  if p_pnl is not null then
    for v_item in select * from jsonb_array_elements(p_pnl)
    loop
      update transactions
         set realized_pnl = case
               when v_item->>'realized_pnl' is null then null
               else (v_item->>'realized_pnl')::numeric
             end
       where id = (v_item->>'id')::uuid and user_id = p_user_id;
    end loop;
  end if;

  -- ── Retour : position recalculée ──
  select to_jsonb(p.*) into v_pos
    from positions p
   where p.id = p_position_id and p.user_id = p_user_id;

  return v_pos;
end;
$$;

revoke all on function public.apply_transaction_mutation(
  uuid, uuid, text, uuid, numeric, numeric, jsonb, jsonb
) from public, anon;

grant execute on function public.apply_transaction_mutation(
  uuid, uuid, text, uuid, numeric, numeric, jsonb, jsonb
) to authenticated;
