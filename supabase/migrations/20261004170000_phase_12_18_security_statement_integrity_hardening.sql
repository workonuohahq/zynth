-- Phase 12–18: security center, server-authority integrity and statement accounting hardening.
-- Reuses existing ZYNTH domains. No duplicate security/risk/compliance/statement tables.

create or replace function public.zynth_security_center()
returns jsonb language plpgsql security definer set search_path='public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); pin_exists boolean:=false; pin_locked_until timestamptz; pin_changed_at timestamptz; alert_count integer:=0; security_status text:='GOOD';
begin
 if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select true,locked_until,last_changed_at into pin_exists,pin_locked_until,pin_changed_at from public.zynth_withdrawal_pins where user_id=v_user;
 select count(*) into alert_count from (
   select 1 from public.zynth_security_login_events e where e.user_id=v_user and e.success=false and e.created_at>now()-interval '30 days' and coalesce(e.risk_score,0)>=50
   union all
   select 1 from public.zynth_withdrawal_security_events e where e.user_id=v_user and coalesce(e.risk_score,0)>=50 and e.created_at>now()-interval '30 days'
 ) q;
 if alert_count>0 or (pin_locked_until is not null and pin_locked_until>now()) then security_status:='REVIEW'; end if;
 return jsonb_build_object(
  'security_status',security_status,
  'security_status_label',case when security_status='GOOD' then 'GOOD' else 'REVIEW REQUIRED' end,
  'security_alert_count',alert_count,
  'withdrawal_pin',jsonb_build_object('configured',coalesce(pin_exists,false),'locked_until',pin_locked_until,'last_changed_at',pin_changed_at),
  'devices',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'device_name',d.device_name,'device_type',d.device_type,'os_name',d.os_name,'os_version',d.os_version,'browser_name',d.browser_name,'browser_version',d.browser_version,'app_mode',d.app_mode,'first_seen_at',d.first_seen_at,'last_seen_at',d.last_seen_at,'last_login_at',d.last_login_at,'revoked_at',d.revoked_at,'trusted_at',d.trusted_at) order by d.last_seen_at desc),'[]'::jsonb) from public.zynth_security_devices d where d.user_id=v_user),
  'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'device_id',s.device_id,'device_type',coalesce(d.device_type,'desktop'),'os_name',coalesce(d.os_name,'Unknown OS'),'browser_name',coalesce(d.browser_name,'Browser'),'app_mode',coalesce(d.app_mode,'web'),'created_at',s.created_at,'last_seen_at',s.last_seen_at,'expires_at',s.expires_at,'current',s.current) order by s.last_seen_at desc),'[]'::jsonb) from public.zynth_security_sessions s left join public.zynth_security_devices d on d.id=s.device_id where s.user_id=v_user and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'success',e.success,'created_at',e.created_at,'failure_reason',e.failure_reason,'risk_score',e.risk_score,'device_id',e.device_id) order by e.created_at desc),'[]'::jsonb) from (select id,event_type,success,created_at,failure_reason,risk_score,device_id from public.zynth_security_login_events where user_id=v_user order by created_at desc limit 50)e),
  'alerts',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) from (
    select e.id,'login' source,e.event_type,e.created_at,e.risk_score,e.failure_reason from public.zynth_security_login_events e where e.user_id=v_user and e.success=false and e.created_at>now()-interval '30 days'
    union all
    select e.id,'withdrawal' source,e.event_type,e.created_at,e.risk_score,nullif(e.metadata->>'reason','') from public.zynth_withdrawal_security_events e where e.user_id=v_user and coalesce(e.risk_score,0)>=50 and e.created_at>now()-interval '30 days'
  )x limit 20)
 );
end; $$;

revoke all on function public.zynth_security_center() from public,anon;
grant execute on function public.zynth_security_center() to authenticated,service_role;

create or replace function public.zynth_strategy_risk_evaluate(p_strategy_id uuid,p_new_nav numeric,p_previous_nav numeric,p_report_return_pct numeric)
returns jsonb language plpgsql security definer set search_path='public','pg_temp'
as $$
declare s public.zynth_strategies%rowtype; dd numeric:=0; aum numeric:=0; breached text[]:=array[]::text[]; reason text; action text:='NONE'; frozen boolean:=false;
begin
 select * into s from public.zynth_strategies where id=p_strategy_id for update;
 if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
 if p_new_nav is null or p_new_nav<=0 then raise exception 'INVALID_NAV'; end if;
 if s.high_water_mark>0 then dd:=(p_new_nav/s.high_water_mark-1)*100; end if;
 select coalesce(sum(i.units*p_new_nav),0) into aum from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 if s.maximum_aum is not null and aum>s.maximum_aum then breached:=array_append(breached,'MAXIMUM_AUM'); end if;
 if s.maximum_drawdown_pct is not null and dd<=-abs(s.maximum_drawdown_pct) then breached:=array_append(breached,'MAXIMUM_DRAWDOWN'); end if;
 if s.daily_loss_limit_pct is not null and p_report_return_pct<=-abs(s.daily_loss_limit_pct) then breached:=array_append(breached,'DAILY_LOSS_LIMIT'); end if;
 if s.emergency_freeze_threshold_pct is not null and dd<=-abs(s.emergency_freeze_threshold_pct) then breached:=array_append(breached,'EMERGENCY_FREEZE'); end if;
 if coalesce(array_length(breached,1),0)>0 then
   frozen:=true; action:='STRATEGY_PAUSED'; reason:=array_to_string(breached,', ');
   update public.zynth_strategies set status='paused',risk_frozen=true,risk_freeze_reason=reason,risk_frozen_at=coalesce(risk_frozen_at,now()),risk_last_evaluated_at=now(),updated_at=now() where id=s.id;
   if not coalesce(s.risk_frozen,false) then
     insert into public.zynth_strategy_risk_events(strategy_id,event_type,threshold_value,observed_value,action,reason) values(s.id,coalesce(breached[1],'RISK_THRESHOLD'),null,dd,action,reason);
     perform public.zynth_emit_admin_notification('strategy.risk.freeze','Strategy paused — risk threshold breached',s.name||' has been automatically paused. New investments are disabled. Trigger: '||reason,'risk','critical','/admin/strategies');
   end if;
 else
   update public.zynth_strategies set risk_last_evaluated_at=now(),updated_at=now() where id=s.id;
 end if;
 return jsonb_build_object('strategy_id',s.id,'drawdown_pct',dd,'daily_return_pct',p_report_return_pct,'aum',aum,'breached',to_jsonb(breached),'frozen',frozen,'action',action);
end; $$;

revoke all on function public.zynth_strategy_risk_evaluate(uuid,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.zynth_strategy_risk_evaluate(uuid,numeric,numeric,numeric) to service_role;

create index if not exists transactions_user_created_at_idx on public.transactions(user_id,created_at desc);
create index if not exists zynth_investment_events_user_created_at_idx on public.zynth_investment_events(user_id,created_at desc);

create or replace function public.zynth_vault_statement_snapshot(p_user_id uuid,p_period_start date,p_period_end date)
returns jsonb language plpgsql security definer set search_path='public','pg_temp'
as $$
declare u public.users%rowtype; opening_wallet numeric:=0; closing_wallet numeric:=0; opening_investment numeric:=0; closing_investment numeric:=0; opening_value numeric:=0; closing_value numeric:=0; deposits numeric:=0; investments numeric:=0; returns numeric:=0; fees numeric:=0; withdrawals numeric:=0; redemptions numeric:=0; ending_nav jsonb; transaction_summary jsonb; reconciliation numeric:=0;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'INVALID_STATEMENT_PERIOD'; end if;
 select * into u from public.users where id=p_user_id; if not found then raise exception 'USER_NOT_FOUND'; end if;
 select coalesce(sum(case when t.direction='credit' then t.amount else -t.amount end),0) into opening_wallet from public.transactions t where t.user_id=p_user_id and t.status::text='completed' and t.created_at<p_period_start::timestamptz and t.direction in ('credit','debit');
 select coalesce(sum(case when t.direction='credit' then t.amount else -t.amount end),0) into closing_wallet from public.transactions t where t.user_id=p_user_id and t.status::text='completed' and t.created_at<(p_period_end+1)::timestamptz and t.direction in ('credit','debit');
 with holdings as (select ie.strategy_id,sum(case when ie.event_type in ('created','adjusted') then ie.units when ie.event_type='redeemed' then -ie.units else 0 end) units from public.zynth_investment_events ie where ie.user_id=p_user_id and ie.created_at<p_period_start::timestamptz group by ie.strategy_id),navs as (select h.strategy_id,h.units,(select nh.nav from public.zynth_nav_history nh where nh.strategy_id=h.strategy_id and nh.nav_date<p_period_start order by nh.nav_date desc,nh.id desc limit 1) nav from holdings h) select coalesce(sum(units*nav),0) into opening_investment from navs where units>0 and nav is not null;
 with holdings as (select ie.strategy_id,sum(case when ie.event_type in ('created','adjusted') then ie.units when ie.event_type='redeemed' then -ie.units else 0 end) units from public.zynth_investment_events ie where ie.user_id=p_user_id and ie.created_at<(p_period_end+1)::timestamptz group by ie.strategy_id),navs as (select h.strategy_id,h.units,(select nh.nav from public.zynth_nav_history nh where nh.strategy_id=h.strategy_id and nh.nav_date<=p_period_end order by nh.nav_date desc,nh.id desc limit 1) nav from holdings h) select coalesce(sum(units*nav),0) into closing_investment from navs where units>0 and nav is not null;
 opening_value:=round(opening_wallet+opening_investment,2); closing_value:=round(closing_wallet+closing_investment,2);
 select coalesce(sum(case when t.type::text='deposit' then t.amount else 0 end),0),coalesce(sum(case when t.type::text in ('investment','topup') then t.amount else 0 end),0),coalesce(sum(case when t.type::text='fee_deduction' then t.amount else 0 end),0),coalesce(sum(case when t.type::text in ('withdrawal','profit_withdrawal') then t.amount else 0 end),0),coalesce(sum(case when t.type::text='investment_redemption' then t.amount else 0 end),0) into deposits,investments,fees,withdrawals,redemptions from public.transactions t where t.user_id=p_user_id and t.status::text='completed' and t.created_at>=p_period_start::timestamptz and t.created_at<(p_period_end+1)::timestamptz;
 select coalesce(sum(ie.amount) filter(where ie.event_type='settled'),0) into returns from public.zynth_investment_events ie where ie.user_id=p_user_id and ie.created_at>=p_period_start::timestamptz and ie.created_at<(p_period_end+1)::timestamptz;
 select coalesce(jsonb_agg(jsonb_build_object('strategy_id',x.strategy_id,'strategy_name',x.name,'nav',x.nav) order by x.name),'[]'::jsonb) into ending_nav from (select distinct on (s.id) s.id strategy_id,s.name,nh.nav from public.zynth_investments i join public.zynth_strategies s on s.id=i.strategy_id join public.zynth_nav_history nh on nh.strategy_id=s.id and nh.nav_date<=p_period_end where i.user_id=p_user_id order by s.id,nh.nav_date desc,nh.id desc)x;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'date',t.created_at,'type',t.type::text,'amount',t.amount,'status',t.status::text,'reference',t.reference) order by t.created_at),'[]'::jsonb) into transaction_summary from public.transactions t where t.user_id=p_user_id and t.created_at>=p_period_start::timestamptz and t.created_at<(p_period_end+1)::timestamptz and t.status::text='completed';
 reconciliation:=round(closing_value-(opening_value+deposits+returns-fees-withdrawals),2);
 return jsonb_build_object('account_id',u.id,'account_email',u.email,'statement_period',jsonb_build_object('start',p_period_start,'end',p_period_end),'opening_balance',opening_value,'opening_wallet_balance',round(opening_wallet,2),'opening_investment_value',round(opening_investment,2),'deposits',round(deposits,2),'investments',round(investments,2),'returns',round(returns,2),'fees',round(fees,2),'withdrawals',round(withdrawals,2),'redemptions',round(redemptions,2),'closing_value',closing_value,'closing_wallet_balance',round(closing_wallet,2),'closing_investment_value',round(closing_investment,2),'ending_nav',ending_nav,'transaction_summary',transaction_summary,'vault_reconciliation_delta',reconciliation,'generated_at',now());
end; $$;

revoke all on function public.zynth_vault_statement_snapshot(uuid,date,date) from public,anon;
grant execute on function public.zynth_vault_statement_snapshot(uuid,date,date) to authenticated,service_role;
