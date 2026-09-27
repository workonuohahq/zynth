-- RBAC runtime integration: role-aware navigation, trader register and admin KPIs.
-- Idempotent reconciliation of production RBAC behavior.

create or replace function public.zynth_get_my_roles(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select coalesce(array_agg(x.key order by x.sort_order,x.key),'{}'::text[])
  from (
    select distinct r.key,r.sort_order
    from public.zynth_user_roles ur
    join public.zynth_roles r on r.id=ur.role_id
    where ur.user_id=p_user_id and ur.is_active and r.is_active
      and (ur.expires_at is null or ur.expires_at>now())
      and auth.uid()=p_user_id
    union
    select case when u.role::text='user' then 'investor' else u.role::text end,999
    from public.users u where u.id=p_user_id and auth.uid()=p_user_id
  ) x;
$$;
revoke all on function public.zynth_get_my_roles(uuid) from public,anon,authenticated;
grant execute on function public.zynth_get_my_roles(uuid) to authenticated;

create or replace function public.zynth_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 select jsonb_build_object(
  'investors',coalesce((select count(distinct ur.user_id) from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id join public.users u on u.id=ur.user_id where r.key='investor' and ur.is_active and r.is_active and (ur.expires_at is null or ur.expires_at>now()) and u.account_status='active'),0),
  'traders',coalesce((select count(distinct ur.user_id) from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id join public.users u on u.id=ur.user_id where r.key='trader' and ur.is_active and r.is_active and (ur.expires_at is null or ur.expires_at>now()) and u.account_status='active'),0),
  'strategies',coalesce((select count(*) from public.zynth_strategies where status='active'),0),
  'aumm',coalesce((select sum(current_value) from public.zynth_investments where status='active'),0),
  'pending_reports',coalesce((select count(*) from public.zynth_daily_reports where status='pending'),0),
  'settlements_30d',coalesce((select count(*) from public.zynth_settlements where settled_at>now()-interval '30 days'),0),
  'withdrawals_pending',coalesce((select count(*) from public.withdrawal_requests where status in ('pending','under_review','processing')),0),
  'pending_deposits',coalesce((select count(*) from public.deposit_requests where status='pending'),0),
  'deposits_30d',coalesce((select count(*) from public.deposit_requests where status='confirmed' and processed_at>now()-interval '30 days'),0),
  'pending_report_queue',coalesce((select jsonb_agg(to_jsonb(x) order by x.report_date asc) from (select r.id,r.report_date,r.closing_balance,r.return_pct,s.name strategy_name,u.full_name trader_name from public.zynth_daily_reports r join public.zynth_strategies s on s.id=r.strategy_id join public.users u on u.id=r.trader_id where r.status='pending' order by r.report_date asc limit 20)x),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$;

create or replace function public.zynth_admin_trader_command_center(p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare result jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'Administrator access required'; end if;
 select jsonb_build_object(
 'traders',coalesce((select jsonb_agg(jsonb_build_object(
   'id',u.id,'email',u.email,'full_name',u.full_name,'account_status',u.account_status,'role',u.role,
   'display_name',coalesce(tp.display_name,u.full_name,u.email,'Trader'),
   'profile',case when tp.user_id is null then null else to_jsonb(tp) end,
   'mt5',case when c.user_id is null then null else jsonb_build_object('id',c.id,'mt5_login',c.mt5_login,'mt5_server',c.mt5_server,'status',c.status,'submitted_at',c.submitted_at,'verified_at',c.verified_at,'rejection_reason',c.rejection_reason,'updated_at',c.updated_at) end,
   'strategy_count',(select count(*) from public.zynth_strategies s where s.trader_id=u.id)
 ) order by u.created_at desc) from public.users u join public.zynth_user_roles ur on ur.user_id=u.id and ur.is_active join public.zynth_roles rr on rr.id=ur.role_id and rr.key='trader' and rr.is_active left join public.zynth_trader_profiles tp on tp.user_id=u.id left join public.zynth_trader_mt5_credentials c on c.user_id=u.id where u.account_status='active' and (ur.expires_at is null or ur.expires_at>now())),'[]'::jsonb),
 'applications','[]'::jsonb,
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'full_name',u.full_name,'account_status',u.account_status,'created_at',u.created_at) order by u.created_at desc) from public.users u where u.account_status='active' and not public.zynth_has_role(u.id,'trader') and not public.zynth_has_role(u.id,'admin')),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$;
revoke all on function public.zynth_admin_trader_command_center(uuid) from public,anon,authenticated;
grant execute on function public.zynth_admin_trader_command_center(uuid) to authenticated;
