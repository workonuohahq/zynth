-- ZYNTH Trade: automated reporting orchestration layer.
-- Synthetic/simulation reports are intentionally isolated from investor NAV.
create table if not exists public.zynth_trade_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  strategy_id uuid not null references public.zynth_strategies(id) on delete restrict,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  source_mode text not null default 'simulation' check (source_mode in ('simulation','validated_source')),
  min_return_pct numeric not null default -9 check (min_return_pct between -100 and 100),
  max_return_pct numeric not null default 10 check (max_return_pct between -100 and 100),
  distribution text not null default 'balanced' check (distribution in ('uniform','balanced','conservative','custom')),
  decimal_places smallint not null default 2 check (decimal_places between 0 and 6),
  weekend_reporting boolean not null default false,
  auto_verification boolean not null default false,
  last_scheduled_cycle date,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_return_pct <= max_return_pct)
);

create unique index if not exists zynth_trade_instances_strategy_unique
on public.zynth_trade_instances(strategy_id);

create table if not exists public.zynth_trade_runs (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.zynth_trade_instances(id) on delete cascade,
  strategy_id uuid not null references public.zynth_strategies(id) on delete restrict,
  cycle_date date not null,
  scheduled_at timestamptz not null,
  generated_return_pct numeric not null,
  generation_policy jsonb not null default '{}'::jsonb,
  source_mode text not null check (source_mode in ('simulation','validated_source')),
  status text not null default 'scheduled' check (status in ('scheduled','pending_verification','approved','rejected','cancelled','failed')),
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  rejection_reason text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_id, cycle_date)
);

create index if not exists zynth_trade_runs_due_idx
on public.zynth_trade_runs(status, scheduled_at);

create index if not exists zynth_trade_runs_strategy_idx
on public.zynth_trade_runs(strategy_id, cycle_date desc);

create or replace function public.zynth_admin_trade_list(p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_admin_id
     or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;

  select jsonb_build_object(
    'instances', coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select i.*, s.name as strategy_name,
          (select count(*) from public.zynth_trade_runs r where r.instance_id=i.id and r.status='pending_verification') as pending_runs,
          (select max(r.scheduled_at) from public.zynth_trade_runs r where r.instance_id=i.id) as latest_scheduled_at,
          (select max(r.submitted_at) from public.zynth_trade_runs r where r.instance_id=i.id) as latest_submitted_at
        from public.zynth_trade_instances i
        join public.zynth_strategies s on s.id=i.strategy_id
      ) x
    ), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(x order by x.scheduled_at desc)
      from (
        select r.*, i.name as instance_name, s.name as strategy_name
        from public.zynth_trade_runs r
        join public.zynth_trade_instances i on i.id=r.instance_id
        join public.zynth_strategies s on s.id=r.strategy_id
        order by r.scheduled_at desc
        limit 50
      ) x
    ), '[]'::jsonb),
    'reporting_window', jsonb_build_object(
      'start_time',(select trader_report_start_time from public.system_settings limit 1),
      'end_time',(select trader_report_end_time from public.system_settings limit 1),
      'timezone',(select settlement_timezone from public.system_settings limit 1)
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.zynth_admin_trade_upsert(
  p_admin_id uuid,
  p_id uuid default null,
  p_name text default null,
  p_strategy_id uuid default null,
  p_status text default 'active',
  p_source_mode text default 'simulation',
  p_min_return_pct numeric default -9,
  p_max_return_pct numeric default 10,
  p_distribution text default 'balanced',
  p_decimal_places integer default 2,
  p_weekend_reporting boolean default false,
  p_auto_verification boolean default false
) returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $$
declare id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_admin_id
     or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if p_name is null or length(btrim(p_name)) < 2 then raise exception 'TRADE_NAME_REQUIRED'; end if;
  if p_strategy_id is null then raise exception 'TRADE_STRATEGY_REQUIRED'; end if;
  if p_status not in ('active','paused','disabled') then raise exception 'TRADE_STATUS_INVALID'; end if;
  if p_source_mode not in ('simulation','validated_source') then raise exception 'TRADE_SOURCE_MODE_INVALID'; end if;
  if p_min_return_pct > p_max_return_pct then raise exception 'TRADE_RETURN_RANGE_INVALID'; end if;
  if p_decimal_places < 0 or p_decimal_places > 6 then raise exception 'TRADE_DECIMAL_PRECISION_INVALID'; end if;
  if p_auto_verification and p_source_mode='simulation' then raise exception 'SIMULATION_AUTO_VERIFICATION_DISABLED'; end if;
  if not exists(select 1 from public.zynth_strategies where id=p_strategy_id and status in ('active','paused')) then raise exception 'TRADE_STRATEGY_INVALID'; end if;

  if p_id is null then
    insert into public.zynth_trade_instances(name,strategy_id,status,source_mode,min_return_pct,max_return_pct,distribution,decimal_places,weekend_reporting,auto_verification,created_by,updated_by)
    values(btrim(p_name),p_strategy_id,p_status,p_source_mode,p_min_return_pct,p_max_return_pct,p_distribution,p_decimal_places,p_weekend_reporting,p_auto_verification,p_admin_id,p_admin_id)
    returning id into id;
  else
    update public.zynth_trade_instances
    set name=btrim(p_name),strategy_id=p_strategy_id,status=p_status,source_mode=p_source_mode,
        min_return_pct=p_min_return_pct,max_return_pct=p_max_return_pct,distribution=p_distribution,
        decimal_places=p_decimal_places,weekend_reporting=p_weekend_reporting,
        auto_verification=p_auto_verification,updated_by=p_admin_id,updated_at=now()
    where id=p_id returning id into id;
    if id is null then raise exception 'TRADE_INSTANCE_NOT_FOUND'; end if;
  end if;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(p_admin_id,case when p_id is null then 'zynth_trade.created' else 'zynth_trade.updated' end,'zynth_trade_instance',id,
    jsonb_build_object('strategy_id',p_strategy_id,'status',p_status,'source_mode',p_source_mode,
      'min_return_pct',p_min_return_pct,'max_return_pct',p_max_return_pct,'distribution',p_distribution));
  return jsonb_build_object('id',id);
end;
$$;

create or replace function public.zynth_admin_trade_verify(
  p_admin_id uuid,
  p_run_id uuid,
  p_approve boolean,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $$
declare r public.zynth_trade_runs%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_admin_id
     or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  select * into r from public.zynth_trade_runs where id=p_run_id for update;
  if not found then raise exception 'TRADE_RUN_NOT_FOUND'; end if;
  if r.status <> 'pending_verification' then raise exception 'TRADE_RUN_NOT_PENDING'; end if;

  update public.zynth_trade_runs
  set status=case when p_approve then 'approved' else 'rejected' end,
      verified_at=now(),verified_by=p_admin_id,rejection_reason=case when p_approve then null else coalesce(nullif(btrim(p_reason),''),'Rejected by operations.') end,
      updated_at=now()
  where id=r.id;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(p_admin_id,case when p_approve then 'zynth_trade.run_approved' else 'zynth_trade.run_rejected' end,'zynth_trade_run',r.id,
    jsonb_build_object('instance_id',r.instance_id,'cycle_date',r.cycle_date,'generated_return_pct',r.generated_return_pct,'source_mode',r.source_mode));
  return jsonb_build_object('run_id',r.id,'status',case when p_approve then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.zynth_admin_trade_list(uuid) from public,anon,authenticated;
revoke all on function public.zynth_admin_trade_upsert(uuid,uuid,text,uuid,text,text,numeric,numeric,text,integer,boolean,boolean) from public,anon,authenticated;
revoke all on function public.zynth_admin_trade_verify(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.zynth_admin_trade_list(uuid) to authenticated;
grant execute on function public.zynth_admin_trade_upsert(uuid,uuid,text,uuid,text,text,numeric,numeric,text,integer,boolean,boolean) to authenticated;
grant execute on function public.zynth_admin_trade_verify(uuid,uuid,boolean,text) to authenticated;