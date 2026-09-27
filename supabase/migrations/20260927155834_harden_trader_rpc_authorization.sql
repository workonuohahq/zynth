-- Harden Trader SECURITY DEFINER RPCs against legacy-role authorization drift.

CREATE OR REPLACE FUNCTION public.zynth_submit_daily_report(
 p_strategy_id uuid, p_report_date date DEFAULT NULL, p_closing_balance numeric DEFAULT NULL,
 p_external_deposit numeric DEFAULT 0, p_external_withdrawal numeric DEFAULT 0, p_note text DEFAULT NULL,
 p_positions_flat boolean DEFAULT false, p_realized_pnl numeric DEFAULT 0, p_unrealized_pnl numeric DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
declare s public.zynth_strategies%rowtype; cfg record; local_now timestamp; local_date date; local_time time; cycle_date date; start_t time; end_t time; opening numeric; prior_unrealized numeric; expected_pnl numeric; reported_pnl numeric; rid uuid;
begin
 if auth.uid() is null then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not public.zynth_has_role(auth.uid(),'trader') then raise exception 'TRADER_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'TRADER_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_profiles tp where tp.user_id=auth.uid() and tp.status in ('approved','active')) then raise exception 'TRADER_PROFILE_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_mt5_credentials c where c.user_id=auth.uid() and c.status='verified' and c.change_requested=false) then raise exception 'MT5_VERIFICATION_REQUIRED'; end if;
 select * into cfg from public.system_settings limit 1; start_t:=coalesce(cfg.trader_report_start_time,'06:00:00'); end_t:=coalesce(cfg.trader_report_end_time,'23:00:00');
 select * into s from public.zynth_strategies where id=p_strategy_id and trader_id=auth.uid() for update; if not found then raise exception 'TRADER_STRATEGY_NOT_FOUND'; end if; if s.status<>'active' then raise exception 'STRATEGY_NOT_ACTIVE'; end if;
 local_now:=now() at time zone coalesce(nullif(s.timezone,''),nullif(cfg.settlement_timezone,''),'Africa/Lagos'); local_date:=local_now::date; local_time:=local_now::time;
 if start_t=end_t then raise exception 'REPORTING_WINDOW_INVALID'; elsif start_t<end_t then if local_time<start_t or local_time>=end_t then raise exception 'REPORTING_WINDOW_CLOSED'; end if; cycle_date:=local_date; else if local_time>=start_t then cycle_date:=local_date; elsif local_time<end_t then cycle_date:=local_date-1; else raise exception 'REPORTING_WINDOW_CLOSED'; end if; end if;
 if p_closing_balance is null or p_closing_balance<0 or p_external_deposit<0 or p_external_withdrawal<0 or p_realized_pnl is null or p_unrealized_pnl is null then raise exception 'INVALID_REPORT'; end if;
 if exists(select 1 from public.zynth_daily_reports where strategy_id=s.id and report_cycle_date=cycle_date and status in('pending','confirmed')) then raise exception 'REPORT_ALREADY_EXISTS'; end if;
 opening:=coalesce((select closing_balance from public.zynth_daily_reports where strategy_id=s.id and status='confirmed' and report_cycle_date<cycle_date order by report_cycle_date desc limit 1),nullif(s.current_reported_balance,0),nullif(s.starting_balance,0)); if opening is null or opening<=0 then raise exception 'NO_OPENING_BALANCE'; end if;
 prior_unrealized:=coalesce((select unrealized_pnl from public.zynth_daily_reports where strategy_id=s.id and status='confirmed' and report_cycle_date<cycle_date order by report_cycle_date desc limit 1),0); expected_pnl:=round(p_realized_pnl+(p_unrealized_pnl-prior_unrealized),8); reported_pnl:=round(p_closing_balance-opening-(p_external_deposit-p_external_withdrawal),8);
 if abs(reported_pnl-expected_pnl)>0.01 then raise exception 'REPORT_PNL_RECONCILIATION_MISMATCH: expected %, reported %',expected_pnl,reported_pnl; end if;
 insert into public.zynth_daily_reports(strategy_id,trader_id,report_date,report_cycle_date,opening_balance,closing_balance,external_deposit,external_withdrawal,trading_pnl,realized_pnl,unrealized_pnl,prior_unrealized_pnl,return_pct,note,positions_flat) values(s.id,auth.uid(),cycle_date,cycle_date,opening,p_closing_balance,p_external_deposit,p_external_withdrawal,reported_pnl,p_realized_pnl,p_unrealized_pnl,prior_unrealized,case when opening=0 then 0 else reported_pnl/opening*100 end,p_note,coalesce(p_positions_flat,false)) returning id into rid;
 return jsonb_build_object('report_id',rid,'report_date',cycle_date,'opening_balance',opening,'closing_balance',p_closing_balance,'trading_pnl',reported_pnl,'realized_pnl',p_realized_pnl,'unrealized_pnl',p_unrealized_pnl,'prior_unrealized_pnl',prior_unrealized,'report_window_start',start_t,'report_window_end',end_t);
end; $function$;

CREATE OR REPLACE FUNCTION public.zynth_trader_create_strategy(p_trader_id uuid,p_name text,p_description text,p_starting_balance numeric,p_minimum numeric,p_maximum numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','pg_temp' AS $function$
declare v_id uuid;
begin
 if auth.uid() is null or auth.uid()<>p_trader_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not public.zynth_has_role(auth.uid(),'trader') then raise exception 'TRADER_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.users where id=p_trader_id and account_status='active') then raise exception 'TRADER_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_profiles where user_id=p_trader_id and status='active') then raise exception 'TRADER_PROFILE_NOT_ACTIVE'; end if;
 if coalesce(length(btrim(p_name)),0)<2 then raise exception 'STRATEGY_NAME_REQUIRED'; end if;
 if p_starting_balance is null or p_starting_balance<=0 then raise exception 'STARTING_BALANCE_MUST_BE_POSITIVE'; end if;
 if p_minimum is null or p_minimum<=0 then raise exception 'MINIMUM_INVESTMENT_MUST_BE_POSITIVE'; end if;
 if p_maximum is not null and p_maximum<p_minimum then raise exception 'MAXIMUM_BELOW_MINIMUM'; end if;
 insert into public.zynth_strategies(name,description,trader_id,starting_balance,current_reported_balance,starting_nav,nav,total_units,high_water_mark,minimum_investment,maximum_investment,status) values(left(btrim(p_name),120),left(coalesce(p_description,''),2000),p_trader_id,p_starting_balance,p_starting_balance,1000,1000,0,1000,p_minimum,p_maximum,'pending_review') returning id into v_id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(p_trader_id,'strategy.proposed','zynth_strategy',v_id,jsonb_build_object('name',left(btrim(p_name),120),'status','pending_review'));
 return jsonb_build_object('success',true,'strategy_id',v_id,'status','pending_review');
end; $function$;

REVOKE EXECUTE ON FUNCTION public.zynth_submit_daily_report(uuid,date,numeric,numeric,numeric,text,boolean,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zynth_submit_daily_report(uuid,date,numeric,numeric,numeric,text,boolean,numeric,numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.zynth_trader_create_strategy(uuid,text,text,numeric,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zynth_trader_create_strategy(uuid,text,text,numeric,numeric,numeric) TO authenticated;
