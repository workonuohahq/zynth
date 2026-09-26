-- Harden ZYNTH strategy lifecycle and settlement invariants.
alter table public.zynth_strategies drop constraint if exists zynth_strategies_status_check;
alter table public.zynth_strategies add constraint zynth_strategies_status_check
check (status = any (array['pending_review','active','paused','archived']));

alter table public.zynth_strategies drop constraint if exists zynth_strategies_name_check;
alter table public.zynth_strategies add constraint zynth_strategies_name_check
check (length(btrim(name)) between 2 and 120);

create index if not exists zynth_strategies_trader_id_idx on public.zynth_strategies(trader_id);
create index if not exists zynth_strategies_status_idx on public.zynth_strategies(status);
create index if not exists zynth_daily_reports_strategy_date_idx on public.zynth_daily_reports(strategy_id, report_date desc);
create index if not exists zynth_settlements_strategy_date_idx on public.zynth_settlements(strategy_id, settlement_date desc);

drop policy if exists "Authenticated users can view active strategies" on public.zynth_strategies;
create policy "Users can view published strategies and owners can view their own"
on public.zynth_strategies for select to authenticated
using (
  status = 'active'
  or trader_id = (select auth.uid())
  or exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.role = 'admin' and u.account_status = 'active'
  )
);

create or replace function public.zynth_trader_create_strategy(
 p_trader_id uuid,p_name text,p_description text,p_starting_balance numeric,p_minimum numeric,p_maximum numeric default null
) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_id uuid;
begin
 if auth.uid() is null or auth.uid()<>p_trader_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not exists(select 1 from public.users where id=p_trader_id and role='trader' and account_status='active') then raise exception 'TRADER_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_profiles where user_id=p_trader_id and status='active') then raise exception 'TRADER_PROFILE_NOT_ACTIVE'; end if;
 if coalesce(length(btrim(p_name)),0)<2 then raise exception 'STRATEGY_NAME_REQUIRED'; end if;
 if p_starting_balance is null or p_starting_balance<=0 then raise exception 'STARTING_BALANCE_MUST_BE_POSITIVE'; end if;
 if p_minimum is null or p_minimum<=0 then raise exception 'MINIMUM_INVESTMENT_MUST_BE_POSITIVE'; end if;
 if p_maximum is not null and p_maximum<p_minimum then raise exception 'MAXIMUM_BELOW_MINIMUM'; end if;
 insert into public.zynth_strategies(name,description,trader_id,starting_balance,current_reported_balance,starting_nav,nav,total_units,high_water_mark,minimum_investment,maximum_investment,status)
 values(left(btrim(p_name),120),left(coalesce(p_description,''),2000),p_trader_id,p_starting_balance,p_starting_balance,1000,1000,0,1000,p_minimum,p_maximum,'pending_review')
 returning id into v_id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(p_trader_id,'strategy.proposed','zynth_strategy',v_id,jsonb_build_object('name',left(btrim(p_name),120),'status','pending_review'));
 return jsonb_build_object('success',true,'strategy_id',v_id,'status','pending_review');
end $$;

create or replace function public.zynth_admin_set_strategy(
 p_admin_id uuid,p_strategy_id uuid,p_name text,p_description text,p_trader_id uuid,p_starting_balance numeric,p_minimum_investment numeric,p_maximum_investment numeric,p_status text
) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare sid uuid:=p_strategy_id; s public.zynth_strategies%rowtype; has_activity boolean;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if coalesce(length(btrim(p_name)),0)<2 then raise exception 'STRATEGY_NAME_REQUIRED'; end if;
 if p_status not in ('pending_review','active','paused','archived') then raise exception 'INVALID_STRATEGY_STATUS'; end if;
 if p_trader_id is not null and not exists(select 1 from public.users u join public.zynth_trader_profiles tp on tp.user_id=u.id where u.id=p_trader_id and u.role='trader' and u.account_status='active' and tp.status='active') then raise exception 'TRADER_NOT_ACTIVE'; end if;
 if sid is null then
   if p_trader_id is null then raise exception 'TRADER_REQUIRED'; end if;
   if p_starting_balance is null or p_starting_balance<=0 then raise exception 'STARTING_BALANCE_MUST_BE_POSITIVE'; end if;
   if p_minimum_investment is null or p_minimum_investment<=0 then raise exception 'MINIMUM_INVESTMENT_MUST_BE_POSITIVE'; end if;
   if p_maximum_investment is not null and p_maximum_investment<p_minimum_investment then raise exception 'MAXIMUM_BELOW_MINIMUM'; end if;
   if p_status='pending_review' then raise exception 'ADMIN_CANNOT_CREATE_PENDING_REVIEW'; end if;
   insert into public.zynth_strategies(name,description,trader_id,starting_balance,current_reported_balance,starting_nav,nav,total_units,high_water_mark,minimum_investment,maximum_investment,status)
   values(left(btrim(p_name),120),left(coalesce(p_description,''),2000),p_trader_id,p_starting_balance,p_starting_balance,1000,1000,0,1000,p_minimum_investment,p_maximum_investment,p_status) returning id into sid;
 else
   select * into s from public.zynth_strategies where id=sid for update;
   if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
   has_activity := exists(select 1 from public.zynth_investments where strategy_id=sid)
                  or exists(select 1 from public.zynth_daily_reports where strategy_id=sid)
                  or exists(select 1 from public.zynth_settlements where strategy_id=sid);
   if has_activity then
     if p_trader_id is distinct from s.trader_id then raise exception 'TRADER_LOCKED_AFTER_ACTIVITY'; end if;
     if p_starting_balance is distinct from s.starting_balance then raise exception 'STARTING_BALANCE_LOCKED'; end if;
     if p_minimum_investment is distinct from s.minimum_investment or p_maximum_investment is distinct from s.maximum_investment then raise exception 'INVESTMENT_LIMITS_LOCKED'; end if;
   else
     if p_trader_id is null then raise exception 'TRADER_REQUIRED'; end if;
     if p_starting_balance is null or p_starting_balance<=0 then raise exception 'STARTING_BALANCE_MUST_BE_POSITIVE'; end if;
     if p_minimum_investment is null or p_minimum_investment<=0 then raise exception 'MINIMUM_INVESTMENT_MUST_BE_POSITIVE'; end if;
     if p_maximum_investment is not null and p_maximum_investment<p_minimum_investment then raise exception 'MAXIMUM_BELOW_MINIMUM'; end if;
     update public.zynth_strategies set trader_id=p_trader_id,starting_balance=p_starting_balance,current_reported_balance=case when s.nav=1000 and s.total_units=0 then p_starting_balance else current_reported_balance end,minimum_investment=p_minimum_investment,maximum_investment=p_maximum_investment where id=sid;
   end if;
   if s.status='archived' and p_status<>'archived' then raise exception 'ARCHIVED_STRATEGY_IS_TERMINAL'; end if;
   if p_status='archived' and exists(select 1 from public.zynth_investments where strategy_id=sid and status='active') then raise exception 'ACTIVE_INVESTORS_BLOCK_ARCHIVE'; end if;
   update public.zynth_strategies set name=left(btrim(p_name),120),description=left(coalesce(p_description,''),2000),status=p_status,updated_at=now() where id=sid;
 end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(p_admin_id,'strategy.saved','zynth_strategy',sid,jsonb_build_object('name',left(btrim(p_name),120),'trader_id',p_trader_id,'status',p_status));
 return (select jsonb_build_object('strategy',to_jsonb(x)) from public.zynth_strategies x where x.id=sid);
end $$;

create or replace function public.zynth_admin_settle_report(p_report_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare r public.zynth_daily_reports%rowtype; s public.zynth_strategies%rowtype; st public.zynth_settlements%rowtype;
 flow numeric; pnl numeric; ret numeric; previous_nav numeric; newnav numeric; beforev numeric; afterv numeric; gain numeric; unlock interval; inv record;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 select * into r from public.zynth_daily_reports where id=p_report_id for update;
 if not found then raise exception 'REPORT_NOT_FOUND'; end if;
 if r.status<>'pending' then raise exception 'REPORT_NOT_PENDING'; end if;
 select * into s from public.zynth_strategies where id=r.strategy_id for update;
 if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
 if s.status<>'active' then raise exception 'STRATEGY_NOT_ACTIVE'; end if;
 if r.trader_id<>s.trader_id then raise exception 'REPORT_TRADER_MISMATCH'; end if;
 if exists(select 1 from public.zynth_settlements where strategy_id=r.strategy_id and settlement_date=r.report_date and status='settled') then raise exception 'DATE_ALREADY_SETTLED'; end if;
 flow:=r.external_deposit-r.external_withdrawal;
 pnl:=r.closing_balance-r.opening_balance-flow;
 ret:=case when r.opening_balance=0 then 0 else pnl/r.opening_balance end;
 previous_nav:=s.nav;
 newnav:=round(previous_nav*(1+ret),8);
 if newnav<=0 then raise exception 'NAV_WOULD_BE_NONPOSITIVE'; end if;
 select coalesce(sum(current_value),0) into beforev from public.zynth_investments where strategy_id=s.id and status='active';
 update public.zynth_strategies set nav=newnav,current_reported_balance=r.closing_balance,high_water_mark=greatest(high_water_mark,newnav),updated_at=now() where id=s.id;
 for inv in select * from public.zynth_investments where strategy_id=s.id and status='active' for update loop
   gain:=round(greatest(0,inv.current_value*ret),8);
   update public.zynth_investments set current_value=round(units*newnav,8),updated_at=now() where id=inv.id;
 end loop;
 select coalesce(sum(current_value),0) into afterv from public.zynth_investments where strategy_id=s.id and status='active';
 insert into public.zynth_settlements(strategy_id,report_id,settlement_date,opening_balance,closing_balance,external_net_flow,trading_pnl,return_pct,previous_nav,nav,investor_value_before,investor_value_after,settled_by)
 values(s.id,r.id,r.report_date,r.opening_balance,r.closing_balance,flow,pnl,ret*100,previous_nav,newnav,beforev,afterv,p_admin_id) returning * into st;
 unlock:=make_interval(days=>coalesce((select vault_profit_lock_days from public.system_settings limit 1),30));
 for inv in select * from public.zynth_investments where strategy_id=s.id and status='active' loop
   gain:=round(greatest(0,(inv.current_value/(1+ret))*ret),8);
   if gain>0 then insert into public.zynth_profit_lots(investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at,unlock_at)
     values(inv.id,st.id,inv.user_id,s.id,gain,now(),now()+unlock); end if;
   insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata)
     values(inv.id,inv.user_id,s.id,'settled',gain,inv.units,newnav,jsonb_build_object('return_pct',ret*100,'settlement_id',st.id,'previous_nav',previous_nav,'new_nav',newnav));
 end loop;
 insert into public.zynth_nav_history(strategy_id,nav_date,previous_nav,nav,return_pct,source_balance,performance_fee,settled_at,settlement_id)
 values(s.id,r.report_date,previous_nav,newnav,ret*100,r.closing_balance,0,now(),st.id)
 on conflict (strategy_id,nav_date) do update set previous_nav=excluded.previous_nav,nav=excluded.nav,return_pct=excluded.return_pct,source_balance=excluded.source_balance,settled_at=excluded.settled_at,settlement_id=excluded.settlement_id;
 update public.zynth_daily_reports set status='confirmed',trading_pnl=pnl,return_pct=ret*100,confirmed_at=now(),confirmed_by=p_admin_id where id=r.id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(p_admin_id,'settlement.confirmed','zynth_settlement',st.id,jsonb_build_object('strategy_id',s.id,'report_id',r.id,'return_pct',ret*100,'previous_nav',previous_nav,'nav',newnav));
 insert into public.notifications(user_id,title,body,type,metadata)
 select distinct inv.user_id,'Strategy settlement confirmed',s.name||' settled at '||to_char(ret*100,'FM999990D00')||'%. Your position has been updated.','settlement',jsonb_build_object('strategy_id',s.id,'settlement_id',st.id,'return_pct',ret*100)
 from public.zynth_investments inv where inv.strategy_id=s.id and inv.status='active';
 return jsonb_build_object('settlement_id',st.id,'return_pct',ret*100,'nav',newnav,'investor_value_before',beforev,'investor_value_after',afterv);
end $$;


-- Performance hardening for strategy-related RLS and foreign keys.
drop policy if exists "zynth_reports_trader_insert" on public.zynth_daily_reports;
create policy "zynth_reports_trader_insert" on public.zynth_daily_reports for insert to authenticated
with check (
 (trader_id=(select auth.uid()))
 and exists(select 1 from public.zynth_strategies s where s.id=zynth_daily_reports.strategy_id and s.trader_id=(select auth.uid()))
);
drop policy if exists "zynth_reports_trader_read" on public.zynth_daily_reports;
create policy "zynth_reports_trader_read" on public.zynth_daily_reports for select to authenticated
using (
 (trader_id=(select auth.uid()))
 or exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active')
);
drop policy if exists "zynth_investment_events_read" on public.zynth_investment_events;
create policy "zynth_investment_events_read" on public.zynth_investment_events for select to authenticated
using (
 (user_id=(select auth.uid()))
 or exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active')
);
drop policy if exists "zynth_profit_lots_read" on public.zynth_profit_lots;
create policy "zynth_profit_lots_read" on public.zynth_profit_lots for select to authenticated
using (
 (user_id=(select auth.uid()))
 or exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active')
);
drop policy if exists "zynth_settlements_read" on public.zynth_settlements;
create policy "zynth_settlements_read" on public.zynth_settlements for select to authenticated
using (
 exists(select 1 from public.zynth_investments i where i.strategy_id=zynth_settlements.strategy_id and i.user_id=(select auth.uid()))
 or exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active')
);

create index if not exists zynth_daily_reports_confirmed_by_idx on public.zynth_daily_reports(confirmed_by);
create index if not exists zynth_daily_reports_corrected_by_idx on public.zynth_daily_reports(corrected_by);
create index if not exists zynth_investment_events_investment_id_idx on public.zynth_investment_events(investment_id);
create index if not exists zynth_investment_events_strategy_id_idx on public.zynth_investment_events(strategy_id);
create index if not exists zynth_investments_strategy_id_idx on public.zynth_investments(strategy_id);
create index if not exists zynth_investments_user_id_idx on public.zynth_investments(user_id);
create index if not exists zynth_profit_lots_settlement_id_idx on public.zynth_profit_lots(settlement_id);
create index if not exists zynth_profit_lots_strategy_id_idx on public.zynth_profit_lots(strategy_id);
create index if not exists zynth_settlements_settled_by_idx on public.zynth_settlements(settled_by);
drop index if exists public.zynth_settlements_strategy_date_idx;
