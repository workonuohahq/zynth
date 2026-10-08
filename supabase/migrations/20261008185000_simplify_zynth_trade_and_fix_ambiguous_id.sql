-- ZYNTH Trade: fix ambiguous instance id and keep generation minimal.
-- The production database function was hot-fixed during the incident; this migration records that fix.

create or replace function public.zynth_admin_trade_upsert(
  p_admin_id uuid, p_id uuid default null, p_name text default null,
  p_strategy_id uuid default null, p_status text default 'active',
  p_source_mode text default 'validated_source',
  p_min_return_pct numeric default -9, p_max_return_pct numeric default 10,
  p_distribution text default 'balanced', p_decimal_places integer default 2,
  p_weekend_reporting boolean default false, p_auto_verification boolean default false
) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare v_instance_id uuid;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id
     or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if p_name is null or length(btrim(p_name))<2 then raise exception 'TRADE_NAME_REQUIRED'; end if;
  if p_strategy_id is null then raise exception 'TRADE_STRATEGY_REQUIRED'; end if;
  if p_status not in('active','paused','disabled') then raise exception 'TRADE_STATUS_INVALID'; end if;
  if p_source_mode<>'validated_source' then raise exception 'TRADE_SOURCE_MODE_INVALID'; end if;
  if p_min_return_pct>p_max_return_pct then raise exception 'TRADE_RETURN_RANGE_INVALID'; end if;
  if p_decimal_places<0 or p_decimal_places>6 then raise exception 'TRADE_DECIMAL_PRECISION_INVALID'; end if;
  if not exists(select 1 from public.zynth_strategies where id=p_strategy_id and status in('active','paused')) then raise exception 'TRADE_STRATEGY_INVALID'; end if;
  if p_id is null then
    insert into public.zynth_trade_instances(name,strategy_id,status,source_mode,min_return_pct,max_return_pct,distribution,decimal_places,weekend_reporting,auto_verification,created_by,updated_by)
    values(btrim(p_name),p_strategy_id,p_status,'validated_source',p_min_return_pct,p_max_return_pct,'uniform',2,p_weekend_reporting,false,p_admin_id,p_admin_id)
    returning zynth_trade_instances.id into v_instance_id;
  else
    update public.zynth_trade_instances as ti
    set name=btrim(p_name),strategy_id=p_strategy_id,status=p_status,source_mode='validated_source',
        min_return_pct=p_min_return_pct,max_return_pct=p_max_return_pct,distribution='uniform',decimal_places=2,
        weekend_reporting=p_weekend_reporting,auto_verification=false,updated_by=p_admin_id,updated_at=now()
    where ti.id=p_id returning ti.id into v_instance_id;
    if v_instance_id is null then raise exception 'TRADE_INSTANCE_NOT_FOUND'; end if;
  end if;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(p_admin_id,case when p_id is null then 'zynth_trade.created' else 'zynth_trade.updated' end,
    'zynth_trade_instance',v_instance_id,jsonb_build_object('strategy_id',p_strategy_id,'status',p_status,
    'min_return_pct',p_min_return_pct,'max_return_pct',p_max_return_pct));
  return jsonb_build_object('id',v_instance_id);
end $function$;

create or replace function public.zynth_trade_generate_daily(
  p_admin_id uuid, p_instance_id uuid, p_cycle_date date default null
) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare
  i public.zynth_trade_instances%rowtype;
  d date:=coalesce(p_cycle_date,(now() at time zone coalesce((select settlement_timezone from public.system_settings limit 1),'Africa/Lagos'))::date);
  start_t time; end_t time; window_seconds integer; sched timestamptz;
  ret numeric; seed double precision; seed2 double precision; exists_id uuid; tz text; actor uuid;
begin
  actor:=case when auth.role()='service_role' then null else p_admin_id end;
  if auth.role()<>'service_role' and (auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active')) then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  select * into i from public.zynth_trade_instances where id=p_instance_id for update;
  if not found then raise exception 'TRADE_INSTANCE_NOT_FOUND'; end if;
  if i.status<>'active' then raise exception 'TRADE_INSTANCE_NOT_ACTIVE'; end if;
  select id into exists_id from public.zynth_trade_runs where instance_id=i.id and cycle_date=d limit 1;
  if exists_id is not null then return jsonb_build_object('run_id',exists_id,'created',false); end if;
  select trader_report_start_time,trader_report_end_time,coalesce(settlement_timezone,'Africa/Lagos') into start_t,end_t,tz from public.system_settings limit 1;
  if start_t is null or end_t is null then raise exception 'TRADER_REPORT_WINDOW_UNCONFIGURED'; end if;
  if extract(isodow from d)>=6 and not i.weekend_reporting then raise exception 'WEEKEND_REPORTING_DISABLED'; end if;
  window_seconds:=case when end_t>=start_t then extract(epoch from end_t-start_t)::integer else extract(epoch from (end_t-start_t)+interval '24 hours')::integer end;
  seed:=abs(hashtext(i.id::text||':'||d::text||':return')::bigint)::double precision/2147483647.0;
  seed2:=abs(hashtext(i.id::text||':'||d::text||':time')::bigint)::double precision/2147483647.0;
  ret:=round((i.min_return_pct+(i.max_return_pct-i.min_return_pct)*seed)::numeric,2);
  sched:=((d + start_t) at time zone tz) + make_interval(secs=>floor(window_seconds*seed2));
  insert into public.zynth_trade_runs(instance_id,strategy_id,cycle_date,scheduled_at,generated_return_pct,generation_policy,source_mode,status)
  values(i.id,i.strategy_id,d,sched,ret,jsonb_build_object('min_return_pct',i.min_return_pct,'max_return_pct',i.max_return_pct,'timing_source','system_settings.trader_report_window','timezone',tz),'validated_source','scheduled')
  returning id into exists_id;
  update public.zynth_trade_instances set last_scheduled_cycle=d,updated_at=now() where id=i.id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(actor,'zynth_trade.run_generated','zynth_trade_run',exists_id,jsonb_build_object('instance_id',i.id,'cycle_date',d,'scheduled_at',sched,'generated_return_pct',ret));
  return jsonb_build_object('run_id',exists_id,'created',true,'scheduled_at',sched,'generated_return_pct',ret);
end $function$;
