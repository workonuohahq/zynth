do $migration$
declare
  v_sig regprocedure;
  v_def text;
  v_new text;
  r record;
begin
  -- Settlement keeps the profit ledger but no longer creates a delayed unlock.
  v_sig := 'public.zynth_admin_settle_report(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := replace(v_def,
    'unlock:=make_interval(days=>coalesce(
    (select vault_profit_lock_days from public.system_settings limit 1),30));',
    'unlock:=interval ''0 days'';');
  if v_new = v_def then
    raise exception 'Could not safely remove settlement lock interval';
  end if;
  v_new := replace(v_new, 'now()+unlock', 'now()');
  v_new := replace(v_new, '  unlock interval;'||E'\n', '');
  v_new := replace(v_new, '  unlock:=interval ''0 days'';'||E'\n', '');
  v_new := replace(v_new,
    'investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at,unlock_at',
    'investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at');
  v_new := replace(v_new,
    'values(inv.id,st.id,inv.user_id,s.id,investor_delta,now(),now());',
    'values(inv.id,st.id,inv.user_id,s.id,investor_delta,now());');
  if position('now()+unlock' in v_new) > 0 then
    raise exception 'Settlement still contains delayed unlock timestamp';
  end if;
  execute v_new;

  -- Preserve old RPC signatures for compatibility, but make the setting inert.
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('zynth_admin_set_investment_settings','zynth_admin_set_investment_settings_v2')
      and pg_get_functiondef(p.oid) ilike '%vault_profit_lock_days=p_vault_profit_lock_days%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'vault_profit_lock_days=p_vault_profit_lock_days', 'vault_profit_lock_days=0');
    v_new := regexp_replace(v_new,
      'if\s+p_vault_profit_lock_days\s*<\s*0\s+or\s+p_vault_profit_lock_days\s*>\s*3650\s+then\s+raise\s+exception\s+''INVALID_LOCK_DAYS'';\s*end\s+if;',
      '', 'gi');
    if v_new = v_def then
      raise exception 'Could not neutralize legacy lock-days setting for %', r.proname;
    end if;
    execute v_new;
  end loop;

  v_sig := 'public.zynth_admin_settlement_preview(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := replace(v_def,
    'select coalesce(v.vault_profit_lock_days,30) into unlock_days from public.system_settings v limit 1;',
    'unlock_days:=0;');
  if v_new <> v_def then execute v_new; end if;

  -- Legacy profit/combined withdrawal paths are disabled by the source guard.
  -- Remove their dormant date-based logic too.
  v_sig := 'public.request_withdrawal_by_source(uuid,numeric,uuid,text)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := replace(v_def, 'l.unlock_at<=now() and ', '');
  v_new := replace(v_new, 'unlock_at<=now() and ', '');
  v_new := replace(v_new, 'order by unlock_at,created_at', 'order by created_at');
  if v_new <> v_def then execute v_new; end if;

  v_sig := 'public.restore_profit_withdrawal_allocations(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := replace(v_def,
    'status=case when unlock_at<=now() then ''paid'' else ''locked'' end',
    'status=''paid''');
  if v_new <> v_def then execute v_new; end if;

  -- Admin investor history reports profit records, not unlock dates.
  v_sig := 'public.admin_get_user_detail(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := replace(v_def,
    '''active_vaults',(select count(*) from public.zynth_profit_lots where user_id=p_user_id and status=''locked''),',
    '''active_vaults',(select count(*) from public.zynth_profit_lots where user_id=p_user_id and status in (''paid'',''partially_withdrawn'',''locked'',''available'') and withdrawn_amount<profit_amount),');
  v_new := replace(v_new,
    '''profit_amount'',l.profit_amount,''generated_at'',l.generated_at,''unlock_at'',l.unlock_at,',
    '''profit_amount'',l.profit_amount,''generated_at'',l.generated_at,');
  if v_new <> v_def then execute v_new; end if;

  -- Remove lock-only metrics from the investor summary contract.
  v_sig := 'public.zynth_investor_summary(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := regexp_replace(v_def,
    '''withdrawable_profit'',least\(coalesce\(\(select sum\(profit_amount-withdrawn_amount\).*?''pending_redemptions''',
    '''pending_redemptions''',
    's');
  if v_new = v_def
     or position('''locked_profit''' in v_new) > 0
     or position('''withdrawable_profit''' in v_new) > 0 then
    raise exception 'Could not safely remove lock-profit summary fields';
  end if;
  execute v_new;

  -- Compatibility shim: no date-based maturity behavior remains.
  execute $fn$
    create or replace function public.zynth_refresh_profit_lot_statuses()
    returns void
    language plpgsql
    security definer
    set search_path to 'public', 'pg_temp'
    as $body$
    begin
      update public.zynth_profit_lots
      set status = 'paid'
      where status = 'locked'
        and withdrawn_amount < profit_amount;
    end;
    $body$;
  $fn$;

  update public.zynth_profit_lots
  set unlock_at = now(),
      status = case when status='locked' then 'paid' else status end
  where unlock_at > now() or status='locked';

  alter table public.zynth_profit_lots alter column unlock_at set default now();

  update public.system_settings
  set vault_profit_lock_days=0, updated_at=now()
  where id='00000000-0000-0000-0000-000000000001';

  comment on column public.system_settings.vault_profit_lock_days is
    'Deprecated compatibility field. Profit locking is disabled; new profit lots are immediately mature.';
end
$migration$;
