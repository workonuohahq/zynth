do $migration$
declare
  v_sig regprocedure;
  v_def text;
  v_new text;
  r record;
begin
  -- Settlement no longer assigns a future unlock date.
  v_sig := 'public.zynth_admin_settle_report(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%unlock_at%' or v_def ilike '%vault_profit_lock_days%' or v_def ilike '%make_interval%' then
    v_new := replace(v_def,
      'unlock:=make_interval(days=>coalesce(
    (select vault_profit_lock_days from public.system_settings limit 1),30));',
      'unlock:=interval ''0 days'';');
    v_new := replace(v_new, 'now()+unlock', 'now()');
    v_new := replace(v_new, '  unlock interval;'||E'\n', '');
    v_new := replace(v_new, '  unlock:=interval ''0 days'';'||E'\n', '');
    v_new := replace(v_new,
      'investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at,unlock_at',
      'investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at');
    v_new := replace(v_new,
      'values(inv.id,st.id,inv.user_id,s.id,investor_delta,now(),now());',
      'values(inv.id,st.id,inv.user_id,s.id,investor_delta,now());');
    if v_new ilike '%unlock_at%' or v_new ilike '%vault_profit_lock_days%' or v_new ilike '%now()+unlock%' then
      raise exception 'Settlement still contains profit-lock behavior';
    end if;
    execute v_new;
  end if;

  -- Retain old RPC signatures for callers, but remove lock-setting behavior and fields.
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('zynth_admin_set_investment_settings','zynth_admin_set_investment_settings_v2')
      and pg_get_functiondef(p.oid) ilike '%vault_profit_lock_days=p_vault_profit_lock_days%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'vault_profit_lock_days=p_vault_profit_lock_days', 'vault_profit_lock_days=0');
    v_new := replace(v_new, 'vault_profit_lock_days=0,', '');
    v_new := replace(v_new, ',''vault_profit_lock_days'',p_vault_profit_lock_days', '');
    v_new := replace(v_new, ',''vault_profit_lock_days'',vault_profit_lock_days', '');
    v_new := regexp_replace(v_new,
      'if\s+p_vault_profit_lock_days\s*<\s*0\s+or\s+p_vault_profit_lock_days\s*>\s*3650\s+then\s+raise\s+exception\s+''INVALID_LOCK_DAYS'';\s*end\s+if;',
      '', 'gi');
    if v_new = v_def then
      raise exception 'Could not neutralize legacy lock setting in %', r.proname;
    end if;
    execute v_new;
  end loop;

  v_sig := 'public.zynth_admin_settlement_preview(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%vault_profit_lock_days%' then
    v_new := replace(v_def,
      'select coalesce(v.vault_profit_lock_days,30) into unlock_days from public.system_settings v limit 1;',
      'unlock_days:=0;');
    if v_new ilike '%vault_profit_lock_days%' then raise exception 'Settlement preview still reads lock setting'; end if;
    execute v_new;
  end if;

  v_sig := 'public.request_withdrawal_by_source(uuid,numeric,uuid,text)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%unlock_at%' then
    v_new := replace(v_def, 'l.unlock_at<=now() and ', '');
    v_new := replace(v_new, 'unlock_at<=now() and ', '');
    v_new := replace(v_new, 'order by unlock_at,created_at', 'order by created_at');
    if v_new ilike '%unlock_at%' then raise exception 'Withdrawal engine still references unlock dates'; end if;
    execute v_new;
  end if;

  v_sig := 'public.restore_profit_withdrawal_allocations(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%unlock_at%' then
    v_new := replace(v_def,
      'status=case when unlock_at<=now() then ''paid'' else ''locked'' end',
      'status=''paid''');
    if v_new ilike '%unlock_at%' then raise exception 'Withdrawal rollback still references unlock dates'; end if;
    execute v_new;
  end if;

  v_sig := 'public.admin_get_user_detail(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%unlock_at%' then
    v_new := replace(v_def,
      chr(39)||'active_vaults'||chr(39)||',(select count(*) from public.zynth_profit_lots where user_id=p_user_id and status='||chr(39)||'locked'||chr(39)||'),',
      chr(39)||'active_vaults'||chr(39)||',(select count(*) from public.zynth_profit_lots where user_id=p_user_id and status in ('||chr(39)||'paid'||chr(39)||','||chr(39)||'partially_withdrawn'||chr(39)||','||chr(39)||'locked'||chr(39)||','||chr(39)||'available'||chr(39)||') and withdrawn_amount<profit_amount),');
    v_new := replace(v_new,
      chr(39)||'profit_amount'||chr(39)||',l.profit_amount,'||chr(39)||'generated_at'||chr(39)||',l.generated_at,'||chr(39)||'unlock_at'||chr(39)||',l.unlock_at,',
      chr(39)||'profit_amount'||chr(39)||',l.profit_amount,'||chr(39)||'generated_at'||chr(39)||',l.generated_at,');
    if v_new ilike '%unlock_at%' then raise exception 'Admin history still exposes unlock dates'; end if;
    execute v_new;
  end if;

  v_sig := 'public.zynth_investor_summary(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%locked_profit%' or v_def ilike '%withdrawable_profit%' then
    v_new := regexp_replace(v_def,
      '''withdrawable_profit'',least\(coalesce\(\(select sum\(profit_amount-withdrawn_amount\).*?''pending_redemptions''',
      '''pending_redemptions''',
      's');
    if v_new ilike '%locked_profit%' or v_new ilike '%withdrawable_profit%' then
      raise exception 'Investor summary still contains lock-profit metrics';
    end if;
    execute v_new;
  end if;

  v_sig := 'public.zynth_refresh_profit_lot_statuses()'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  if v_def ilike '%unlock_at%' then
    v_new := regexp_replace(v_def,
      'unlock_at\s*=\s*least\(unlock_at,\s*now\(\)\)\s*,\s*status\s*=\s*case\s+when\s+unlock_at\s*<=\s*now\(\)\s+then\s+''paid''\s+else\s+''locked''\s+end',
      'status = ''paid''', 'gi');
    v_new := regexp_replace(v_new,
      'unlock_at\s*=\s*least\(unlock_at,\s*now\(\)\)\s*,\s*status\s*=\s*''paid''',
      'status = ''paid''', 'gi');
    v_new := replace(v_new,
      'set status = case when unlock_at <= now() then ''paid'' else ''locked'' end',
      'set status = ''paid''');
    if v_new ilike '%unlock_at%' then raise exception 'Profit status refresh still uses unlock dates'; end if;
    execute v_new;
  end if;

  update public.zynth_profit_lots
  set status = case when withdrawn_amount >= profit_amount then 'withdrawn' else 'paid' end
  where status='locked';

  alter table public.zynth_profit_lots drop column if exists unlock_at;
  alter table public.system_settings drop column if exists vault_profit_lock_days;
end
$migration$;
