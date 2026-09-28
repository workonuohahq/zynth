-- Add the active investor-redemption queue count to the admin dashboard payload.
-- The metric intentionally matches the redemption control center's active states:
-- pending review, approved awaiting release, and processing.

create or replace function public.zynth_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.zynth_has_role(auth.uid(),'admin') then
   raise exception 'ADMIN_AUTHORIZATION_REQUIRED';
 end if;

 select jsonb_build_object(
  'investors',coalesce((select count(distinct ur.user_id) from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id join public.users u on u.id=ur.user_id where r.key='investor' and ur.is_active and r.is_active and (ur.expires_at is null or ur.expires_at>now()) and u.account_status='active'),0),
  'traders',coalesce((select count(distinct ur.user_id) from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id join public.users u on u.id=ur.user_id where r.key='trader' and ur.is_active and r.is_active and (ur.expires_at is null or ur.expires_at>now()) and u.account_status='active'),0),
  'strategies',coalesce((select count(*) from public.zynth_strategies where status='active'),0),
  'aumm',coalesce((select sum(current_value) from public.zynth_investments where status='active'),0),
  'pending_reports',coalesce((select count(*) from public.zynth_daily_reports where status='pending'),0),
  'settlements_30d',coalesce((select count(*) from public.zynth_settlements where settled_at>now()-interval '30 days'),0),
  'withdrawals_pending',coalesce((select count(*) from public.withdrawal_requests where status in ('pending','under_review','processing')),0),
  'pending_redemptions',coalesce((select count(*) from public.zynth_redemption_requests where status in ('pending','approved','processing')),0),
  'pending_deposits',coalesce((select count(*) from public.deposit_requests where status='pending'),0),
  'deposits_30d',coalesce((select count(*) from public.deposit_requests where status='confirmed' and processed_at>now()-interval '30 days'),0),
  'pending_report_queue',coalesce((select jsonb_agg(to_jsonb(x) order by x.report_date asc) from (select r.id,r.report_date,r.closing_balance,r.return_pct,s.name strategy_name,u.full_name trader_name from public.zynth_daily_reports r join public.zynth_strategies s on s.id=r.strategy_id join public.users u on u.id=r.trader_id where r.status='pending' order by r.report_date asc limit 20)x),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$;