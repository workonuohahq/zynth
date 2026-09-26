-- Trader valuation reporting: time window, one report per cycle, and realized/unrealized P&L.
alter table public.system_settings
  add column if not exists trader_report_start_time time without time zone not null default '06:00:00',
  add column if not exists trader_report_end_time time without time zone not null default '23:00:00';

alter table public.zynth_daily_reports
  add column if not exists realized_pnl numeric not null default 0,
  add column if not exists unrealized_pnl numeric not null default 0,
  add column if not exists prior_unrealized_pnl numeric not null default 0,
  add column if not exists report_cycle_date date;

update public.zynth_daily_reports
set realized_pnl=coalesce(realized_pnl,trading_pnl),
    unrealized_pnl=coalesce(unrealized_pnl,0),
    prior_unrealized_pnl=coalesce(prior_unrealized_pnl,0),
    report_cycle_date=coalesce(report_cycle_date,report_date)
where report_cycle_date is null;

create index if not exists zynth_daily_reports_cycle_idx
on public.zynth_daily_reports(strategy_id,report_cycle_date,status);

alter table public.zynth_investments
add column if not exists unrealized_pnl numeric not null default 0;

create or replace function public.zynth_submit_daily_report(
 p_strategy_id uuid,p_report_date date default null,p_closing_balance numeric default null,
 p_external_deposit numeric default 0,p_external_withdrawal numeric default 0,p_note text default null,
 p_positions_flat boolean default false,p_realized_pnl numeric default 0,p_unrealized_pnl numeric default 0
) returns jsonb language plpgsql as $function$
declare s public.zynth_strategies%rowtype;cfg record;local_now timestamp;local_date date;local_time time;
 cycle_date date;start_t time;end_t time;opening numeric;prior_unrealized numeric;expected_pnl numeric;reported_pnl numeric;rid uuid;
begin
 if auth.uid() is null then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_profiles tp where tp.user_id=auth.uid() and tp.status='approved') then raise exception 'TRADER_PROFILE_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_mt5_credentials c where c.user_id=auth.uid() and c.status='verified') then raise exception 'MT5_VERIFICATION_REQUIRED'; end if;
 select * into cfg from public.system_settings limit 1;
 start_t:=coalesce(cfg.trader_report_start_time,'06:00:00');end_t:=coalesce(cfg.trader_report_end_time,'23:00:00');
 select * into s from public.zynth_strategies where id=p_strategy_id and trader_id=auth.uid() for update;
 if not found then raise exception 'TRADER_STRATEGY_NOT_FOUND'; end if;
 if s.status<>'active' then raise exception 'STRATEGY_NOT_ACTIVE'; end if;
 local_now:=now() at time zone coalesce(nullif(s.timezone,''),nullif(cfg.settlement_timezone,''),'Africa/Lagos');
 local_date:=local_now::date;local_time:=local_now::time;
 if start_t=end_t then raise exception 'REPORTING_WINDOW_INVALID';
 elsif start_t<end_t then
  if local_time<start_t or local_time>=end_t then raise exception 'REPORTING_WINDOW_CLOSED'; end if;
  cycle_date:=local_date;
 else
  if local_time>=start_t then cycle_date:=local_date;
  elsif local_time<end_t then cycle_date:=local_date-1;
  else raise exception 'REPORTING_WINDOW_CLOSED'; end if;
 end if;
 if p_closing_balance is null or p_closing_balance<0 or p_external_deposit<0 or p_external_withdrawal<0
    or p_realized_pnl is null or p_unrealized_pnl is null then raise exception 'INVALID_REPORT'; end if;
 if exists(select 1 from public.zynth_daily_reports where strategy_id=s.id and report_cycle_date=cycle_date and status in('pending','confirmed')) then raise exception 'REPORT_ALREADY_EXISTS'; end if;
 opening:=coalesce((select closing_balance from public.zynth_daily_reports where strategy_id=s.id and status='confirmed' and report_cycle_date<cycle_date order by report_cycle_date desc limit 1),nullif(s.current_reported_balance,0),nullif(s.starting_balance,0));
 if opening is null or opening<=0 then raise exception 'NO_OPENING_BALANCE'; end if;
 prior_unrealized:=coalesce((select unrealized_pnl from public.zynth_daily_reports where strategy_id=s.id and status='confirmed' and report_cycle_date<cycle_date order by report_cycle_date desc limit 1),0);
 expected_pnl:=round(p_realized_pnl+(p_unrealized_pnl-prior_unrealized),8);
 reported_pnl:=round(p_closing_balance-opening-(p_external_deposit-p_external_withdrawal),8);
 if abs(reported_pnl-expected_pnl)>0.01 then raise exception 'REPORT_PNL_RECONCILIATION_MISMATCH: expected %, reported %',expected_pnl,reported_pnl; end if;
 insert into public.zynth_daily_reports(strategy_id,trader_id,report_date,report_cycle_date,opening_balance,closing_balance,external_deposit,external_withdrawal,trading_pnl,realized_pnl,unrealized_pnl,prior_unrealized_pnl,return_pct,note,positions_flat)
 values(s.id,auth.uid(),cycle_date,cycle_date,opening,p_closing_balance,p_external_deposit,p_external_withdrawal,reported_pnl,p_realized_pnl,p_unrealized_pnl,prior_unrealized,case when opening=0 then 0 else reported_pnl/opening*100 end,p_note,coalesce(p_positions_flat,false))
 returning id into rid;
 return jsonb_build_object('report_id',rid,'report_date',cycle_date,'opening_balance',opening,'closing_balance',p_closing_balance,'trading_pnl',reported_pnl,'realized_pnl',p_realized_pnl,'unrealized_pnl',p_unrealized_pnl,'prior_unrealized_pnl',prior_unrealized,'report_window_start',start_t,'report_window_end',end_t);
end;$function$;

create or replace function public.zynth_admin_settle_report(p_report_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare r public.zynth_daily_reports%rowtype;s public.zynth_strategies%rowtype;st public.zynth_settlements%rowtype;
 flow numeric;pnl numeric;ret numeric;previous_nav numeric;newnav numeric;beforev numeric;afterv numeric;realized_alloc numeric;unrealized_alloc numeric;total_units numeric;unlock interval;inv record;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 select * into r from public.zynth_daily_reports where id=p_report_id for update;if not found then raise exception 'REPORT_NOT_FOUND';end if;if r.status<>'pending' then raise exception 'REPORT_NOT_PENDING';end if;
 select * into s from public.zynth_strategies where id=r.strategy_id for update;if not found then raise exception 'STRATEGY_NOT_FOUND';end if;if s.status<>'active' then raise exception 'STRATEGY_NOT_ACTIVE';end if;if r.trader_id<>s.trader_id then raise exception 'REPORT_TRADER_MISMATCH';end if;
 if exists(select 1 from public.zynth_settlements where strategy_id=r.strategy_id and settlement_date=r.report_date and status='settled') then raise exception 'DATE_ALREADY_SETTLED';end if;
 flow:=r.external_deposit-r.external_withdrawal;pnl:=r.trading_pnl;ret:=case when r.opening_balance=0 then 0 else pnl/r.opening_balance end;previous_nav:=s.nav;newnav:=round(previous_nav*(1+ret),8);if newnav<=0 then raise exception 'NAV_WOULD_BE_NONPOSITIVE';end if;
 select coalesce(sum(current_value),0) into beforev from public.zynth_investments where strategy_id=s.id and status='active';
 update public.zynth_strategies set nav=newnav,current_reported_balance=r.closing_balance,high_water_mark=greatest(high_water_mark,newnav),updated_at=now() where id=s.id;
 select coalesce(sum(units),0) into total_units from public.zynth_investments where strategy_id=s.id and status='active';
 for inv in select * from public.zynth_investments where strategy_id=s.id and status='active' for update loop
  realized_alloc:=case when total_units=0 then 0 else round(r.realized_pnl*(inv.units/total_units),8) end;
  unrealized_alloc:=case when total_units=0 then 0 else round(r.unrealized_pnl*(inv.units/total_units),8) end;
  update public.zynth_investments set current_value=round(units*newnav,8),unrealized_pnl=unrealized_alloc,realized_profit=greatest(0,realized_profit+greatest(realized_alloc,0)),realized_loss=greatest(0,realized_loss+greatest(-realized_alloc,0)),updated_at=now() where id=inv.id;
 end loop;
 select coalesce(sum(current_value),0) into afterv from public.zynth_investments where strategy_id=s.id and status='active';
 insert into public.zynth_settlements(strategy_id,report_id,settlement_date,opening_balance,closing_balance,external_net_flow,trading_pnl,return_pct,previous_nav,nav,investor_value_before,investor_value_after,settled_by)
 values(s.id,r.id,r.report_date,r.opening_balance,r.closing_balance,flow,pnl,ret*100,previous_nav,newnav,beforev,afterv,p_admin_id) returning * into st;
 unlock:=make_interval(days=>coalesce((select vault_profit_lock_days from public.system_settings limit 1),30));
 for inv in select * from public.zynth_investments where strategy_id=s.id and status='active' loop
  realized_alloc:=case when total_units=0 then 0 else round(r.realized_pnl*(inv.units/total_units),8) end;
  if realized_alloc>0 then insert into public.zynth_profit_lots(investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at,unlock_at) values(inv.id,st.id,inv.user_id,s.id,realized_alloc,now(),now()+unlock);end if;
  insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata) values(inv.id,inv.user_id,s.id,'settled',realized_alloc,inv.units,newnav,jsonb_build_object('return_pct',ret*100,'settlement_id',st.id,'previous_nav',previous_nav,'new_nav',newnav,'realized_pnl',r.realized_pnl,'unrealized_pnl',r.unrealized_pnl));
 end loop;
 insert into public.zynth_nav_history(strategy_id,nav_date,previous_nav,nav,return_pct,source_balance,performance_fee,settled_at,settlement_id) values(s.id,r.report_date,previous_nav,newnav,ret*100,r.closing_balance,0,now(),st.id)
 on conflict(strategy_id,nav_date) do update set previous_nav=excluded.previous_nav,nav=excluded.nav,return_pct=excluded.return_pct,source_balance=excluded.source_balance,settled_at=excluded.settled_at,settlement_id=excluded.settlement_id;
 update public.zynth_daily_reports set status='confirmed',trading_pnl=pnl,return_pct=ret*100,confirmed_at=now(),confirmed_by=p_admin_id where id=r.id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(p_admin_id,'settlement.confirmed','zynth_settlement',st.id,jsonb_build_object('strategy_id',s.id,'report_id',r.id,'return_pct',ret*100,'previous_nav',previous_nav,'nav',newnav,'realized_pnl',r.realized_pnl,'unrealized_pnl',r.unrealized_pnl));
 insert into public.notifications(user_id,title,body,type,metadata) select distinct i.user_id,'Strategy settlement confirmed',s.name||' settled at '||to_char(ret*100,'FM999990D00')||'%. Your position has been updated.','settlement',jsonb_build_object('strategy_id',s.id,'settlement_id',st.id,'return_pct',ret*100,'realized_pnl',r.realized_pnl,'unrealized_pnl',r.unrealized_pnl) from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 return jsonb_build_object('settlement_id',st.id,'return_pct',ret*100,'nav',newnav,'investor_value_before',beforev,'investor_value_after',afterv,'realized_pnl',r.realized_pnl,'unrealized_pnl',r.unrealized_pnl);
end;$function$;

create or replace function public.zynth_admin_settlement_preview(p_report_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare r public.zynth_daily_reports%rowtype;s public.zynth_strategies%rowtype;trader record;flow numeric;pnl numeric;ret numeric;newnav numeric;unlock_days integer;beforev numeric;afterv numeric;investors jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=auth.uid() and role='admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;
 select * into r from public.zynth_daily_reports where id=p_report_id;if not found then raise exception 'REPORT_NOT_FOUND';end if;if r.status<>'pending' then raise exception 'REPORT_NOT_PENDING';end if;
 select * into s from public.zynth_strategies where id=r.strategy_id;if not found then raise exception 'STRATEGY_NOT_FOUND';end if;
 select u.id,u.full_name,u.email into trader from public.users u where u.id=r.trader_id;
 flow:=r.external_deposit-r.external_withdrawal;pnl:=r.trading_pnl;ret:=case when r.opening_balance=0 then 0 else pnl/r.opening_balance end;newnav:=round(s.nav*(1+ret),8);if newnav<=0 then raise exception 'NAV_WOULD_BE_NONPOSITIVE';end if;
 select coalesce(sum(current_value),0) into beforev from public.zynth_investments where strategy_id=s.id and status='active';afterv:=round(beforev*(1+ret),8);
 select coalesce(jsonb_agg(jsonb_build_object('investment_id',i.id,'user_id',i.user_id,'investor_name',coalesce(u.full_name,u.email,'Investor'),'principal',i.principal,'units',i.units,'current_value_before',round(i.current_value,8),'current_value_after',round(i.units*newnav,8),'change',round((i.units*newnav)-i.current_value,8),'profit_created',round(greatest(0,r.realized_pnl*(case when s.total_units=0 then 0 else i.units/s.total_units end)),8),'realized_pnl',round(r.realized_pnl*(case when s.total_units=0 then 0 else i.units/s.total_units end),8),'unrealized_pnl',round(r.unrealized_pnl*(case when s.total_units=0 then 0 else i.units/s.total_units end),8)) order by i.current_value desc),'[]'::jsonb) into investors from public.zynth_investments i left join public.users u on u.id=i.user_id where i.strategy_id=s.id and i.status='active';
 select coalesce(v.vault_profit_lock_days,30) into unlock_days from public.system_settings v limit 1;
 return jsonb_build_object('report',jsonb_build_object('id',r.id,'report_date',r.report_date,'status',r.status,'opening_balance',r.opening_balance,'closing_balance',r.closing_balance,'external_deposit',r.external_deposit,'external_withdrawal',r.external_withdrawal,'external_net_flow',flow,'trading_pnl',pnl,'realized_pnl',r.realized_pnl,'unrealized_pnl',r.unrealized_pnl,'prior_unrealized_pnl',r.prior_unrealized_pnl,'return_pct',ret*100,'note',r.note,'positions_flat',r.positions_flat,'submitted_at',r.submitted_at),'strategy',jsonb_build_object('id',s.id,'name',s.name,'nav_before',s.nav,'nav_after',newnav,'current_reported_balance',s.current_reported_balance,'new_reported_balance',r.closing_balance,'total_units',s.total_units,'performance_fee_pct',s.performance_fee_pct),'trader',jsonb_build_object('id',trader.id,'name',trader.full_name,'email',trader.email),'investors',investors,'investor_value_before',beforev,'investor_value_after',afterv,'investor_value_change',afterv-beforev,'vault_lock_days',unlock_days);
end;$function$;

create or replace function public.zynth_investor_summary(p_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $function$
declare uid uuid;result jsonb;
begin
 uid:=coalesce(p_user_id,auth.uid());if auth.uid() is null or auth.uid()<>uid then raise exception 'AUTHORIZATION_REQUIRED';end if;
 perform public.zynth_release_due_redemptions(uid);perform public.zynth_refresh_profit_lot_statuses();
 select jsonb_build_object('cash',coalesce((select main_wallet_balance from public.users where id=uid),0),'invested',coalesce((select sum(current_value) from public.zynth_investments where user_id=uid and status='active'),0),'principal',coalesce((select sum(principal_remaining) from public.zynth_investments where user_id=uid and status='active'),0),'profit',coalesce((select sum(greatest(current_value-principal_remaining,0)) from public.zynth_investments where user_id=uid and status='active'),0),'realized_profit',coalesce((select sum(realized_profit-realized_loss) from public.zynth_investments where user_id=uid and status='active'),0),'unrealized_profit',coalesce((select sum(unrealized_pnl) from public.zynth_investments where user_id=uid and status='active'),0),'withdrawable_profit',least(coalesce((select sum(profit_amount-withdrawn_amount) from public.zynth_profit_lots where user_id=uid and unlock_at<=now() and withdrawn_amount<profit_amount),0),coalesce((select sum(greatest(current_value-principal_remaining,0)) from public.zynth_investments where user_id=uid and status='active'),0)),'locked_profit',greatest(coalesce((select sum(profit_amount-withdrawn_amount) from public.zynth_profit_lots where user_id=uid and unlock_at>now() and withdrawn_amount<profit_amount),0),0),'pending_redemptions',coalesce((select sum(net_amount) from public.zynth_redemption_requests where user_id=uid and status in ('pending','approved','processing')),0)) into result;
 return result;
end;$function$;
