-- =============================================================================
-- FIRECORE — Migration 057 : sécurisation de la RPC apply_transaction_mutation
-- =============================================================================
-- Hotfix sécurité (Sprint H). La migration 056 créait la fonction en
-- SECURITY DEFINER avec un `grant execute ... to authenticated` mais sans
-- `revoke` : Postgres accorde EXECUTE à PUBLIC par défaut, donc le rôle `anon`
-- pouvait l'appeler via /rest/v1/rpc/apply_transaction_mutation. De plus, le
-- contrôle d'appartenance comparait le propriétaire à `p_user_id`, paramètre
-- fourni par l'appelant, et non à l'utilisateur authentifié.
--
-- Correctif (cas A : l'unique appelant, app/api/transactions/[id]/route.ts,
-- utilise le client de session utilisateur) :
--   1. Signature inchangée (pas de changement d'API).
--   2. Refus immédiat si auth.uid() est nul ou différent de p_user_id
--      (exception AUTH_UID_MISMATCH, errcode 42501).
--   3. Toutes les vérifications / filtres d'appartenance utilisent auth.uid().
--   4. search_path = public, pg_temp.
--   5. REVOKE ALL FROM PUBLIC, anon ; GRANT EXECUTE TO authenticated.
--
-- Le reste du corps est repris à l'identique de pg_get_functiondef (état 056).
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
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_pos   jsonb;
  v_item  jsonb;
begin
  if v_uid is null or p_user_id is distinct from v_uid then
    raise exception 'AUTH_UID_MISMATCH' using errcode = '42501';
  end if;

  select user_id into v_owner from transactions where id = p_tx_id;
  if v_owner is null then
    raise exception 'TX_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner <> v_uid then
    raise exception 'TX_NOT_OWNED' using errcode = '42501';
  end if;

  if p_op = 'delete' then
    delete from transactions
     where id = p_tx_id and user_id = v_uid;

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
      realized_pnl = null
     where id = p_tx_id and user_id = v_uid;

  else
    raise exception 'BAD_OP: %', p_op using errcode = '22023';
  end if;

  update positions
     set quantity = p_new_qty, average_price = p_new_pru
   where id = p_position_id and user_id = v_uid;

  if p_pnl is not null then
    for v_item in select * from jsonb_array_elements(p_pnl)
    loop
      update transactions
         set realized_pnl = case
               when v_item->>'realized_pnl' is null then null
               else (v_item->>'realized_pnl')::numeric
             end
       where id = (v_item->>'id')::uuid and user_id = v_uid;
    end loop;
  end if;

  select to_jsonb(p.*) into v_pos
    from positions p
   where p.id = p_position_id and p.user_id = v_uid;

  return v_pos;
end;
$$;

revoke all on function public.apply_transaction_mutation(
  uuid, uuid, text, uuid, numeric, numeric, jsonb, jsonb
) from public, anon;

grant execute on function public.apply_transaction_mutation(
  uuid, uuid, text, uuid, numeric, numeric, jsonb, jsonb
) to authenticated;

comment on function public.apply_transaction_mutation is
  'Sprint 3 — applique atomiquement l''édition/suppression d''une transaction : '
  'mutation de la ligne, recalcul positions.quantity/average_price, et '
  'réécriture des realized_pnl. Valeurs pré-calculées côté TS '
  '(lib/portfolio/transaction-edit.ts). SECURITY DEFINER ; appartenance '
  'vérifiée sur auth.uid() (migration 057) ; EXECUTE réservé à authenticated.';
