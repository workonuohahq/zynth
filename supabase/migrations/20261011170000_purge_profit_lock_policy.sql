do $migration$
declare
  v_sig regprocedure;
  v_def text;
  v_new text;
  r record;
begin
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
  if position('now()+unlock' in v_new) > 0 then
    raise exception 'Settlement still contains delayed unlock timestamp';
  end if;
  execute v_new;

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
      'if p_vault_profit_lock_days<0 or p_vault_profit_lock_days>3650 then raise exception ''INVALID_LOCK_DAYS'';end if;',
      '', 'gi');
    if v_new = v_def then raise exception 'Could not neutralize legacy lock-days setting for %', r.proname; end if;
    execute v_new;
  end loop;

  v_sig := 'public.zynth_admin_settlement_preview(uuid,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := replace(v_def,
    'select coalesce(v.vault_profit_lock_days,30) into unlock_days from public.system_settings v limit 1;',
    'unlock_days:=0;');
  if v_new <> v_def then execute v_new; end if;

  v_sig := 'public.zynth_investor_summary(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_sig);
  v_new := regexp_replace(v_def,
    '''withdrawable_profit'',least\(coalesce\(\(select sum\(profit_amount-withdrawn_amount\).*?''pending_redemptions''',
    '''withdrawable_profit'',0,
  ''locked_profit'',0,
  ''pending_redemptions''',
    's');
  if v_new = v_def or position('''locked_profit'',greatest' in v_new) > 0 then
    raise exception 'Could not safely remove locked-profit calculations from investor summary';
  end if;
  execute v_new;

  execute $fn$
    create or replace function public.zynth_refresh_profit_lot_statuses()
    returns void
    language plpgsql
    security definer
    set search_path to 'public', 'pg_temp'
    as $body$
    begin
      update public.zynth_profit_lots
      set unlock_at = least(unlock_at, now()),
          status = 'paid'
      where status = 'locked'
        and withdrawn_amount < profit_amount;
    end;
    $body$;
  $fn$;

  update public.zynth_profit_lots
  set unlock_at = now(),
      status = case when status='locked' then 'paid' else status end
  where unlock_at > now() or status='locked';

  update public.system_settings
  set vault_profit_lock_days=0, updated_at=now()
  where id='00000000-0000-0000-0000-000000000001';

  comment on column public.system_settings.vault_profit_lock_days is
    'Deprecated compatibility field. Profit locking is disabled; new profit lots are immediately mature.';
end
$migration$;
