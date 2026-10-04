-- Phase 7 allocation semantics patch: percentage is measured against configured strategy cap
CREATE OR REPLACE FUNCTION public.zynth_create_investment(p_user_id uuid, p_strategy_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u public.users%rowtype;s public.zynth_strategies%rowtype;inv uuid;units numeric;enabled boolean;entry boolean;v_aum numeric;v_investor numeric;v_reserved numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select investment_enabled,strategy_entry_enabled into enabled,entry from public.system_settings limit 1;
 if not coalesce(enabled,false) or not coalesce(entry,false) then raise exception 'INVESTMENTS_DISABLED'; end if;
 select * into u from public.users where id=p_user_id for update;if not found then raise exception 'USER_NOT_FOUND';end if;
 select * into s from public.zynth_strategies where id=p_strategy_id for update;if not found or s.status<>'active' or coalesce(s.risk_frozen,false) then raise exception 'STRATEGY_UNAVAILABLE';end if;
 if s.minimum_investment>0 and p_amount<s.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT';end if;
 if s.maximum_investment is not null and p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT';end if;
 select coalesce(sum(i.current_value),0),coalesce(sum(i.current_value) filter(where i.user_id=p_user_id),0) into v_aum,v_investor from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 select coalesce(sum(d.amount),0) into v_reserved from public.deposit_requests d where d.status='pending' and (d.user_note like 'INVESTMENT_STRATEGY='||s.id::text or d.user_note like 'CRYPTO_INVESTMENT_STRATEGY='||s.id::text);
 if s.maximum_capacity is not null and v_aum+v_reserved+p_amount>s.maximum_capacity then raise exception 'STRATEGY_CAPACITY_REACHED'; end if;
 if s.maximum_aum is not null and v_aum+p_amount>s.maximum_aum then raise exception 'STRATEGY_RISK_AUM_LIMIT'; end if;
 if s.maximum_investor_allocation is not null and v_investor+p_amount>s.maximum_investor_allocation then raise exception 'INVESTOR_ALLOCATION_LIMIT'; end if;
 if s.maximum_strategy_allocation_pct is not null and coalesce(s.maximum_aum,s.maximum_capacity) is not null and v_investor+p_amount>coalesce(s.maximum_aum,s.maximum_capacity)*s.maximum_strategy_allocation_pct/100 then raise exception 'STRATEGY_ALLOCATION_LIMIT'; end if;
 if u.main_wallet_balance<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE';end if;
 units:=p_amount/nullif(s.nav,0);
 update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
 insert into public.zynth_investments(user_id,strategy_id,principal,principal_remaining,units,entry_nav,current_value,status) values(p_user_id,p_strategy_id,p_amount,p_amount,units,s.nav,p_amount,'active') returning id into inv;
 update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
 insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav) values(inv,p_user_id,p_strategy_id,'created',p_amount,units,s.nav);
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'investment',p_amount,'completed','ZYN-INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),jsonb_build_object('strategy_id',p_strategy_id,'investment_id',inv,'nav',s.nav,'units',units));
 return jsonb_build_object('investment_id',inv,'amount',p_amount,'units',units,'nav',s.nav);
end; $function$;

CREATE OR REPLACE FUNCTION public.zynth_create_topup(p_user_id uuid, p_investment_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u public.users%rowtype;inv public.zynth_investments%rowtype;s public.zynth_strategies%rowtype;st public.system_settings%rowtype;units numeric;new_units numeric;new_principal numeric;v_aum numeric;v_investor numeric;v_reserved numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select * into st from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not st.investment_enabled or not st.strategy_entry_enabled or not st.topup_enabled then raise exception 'TOPUPS_DISABLED'; end if;
 if p_amount<st.topup_min_amount then raise exception 'BELOW_MINIMUM_TOPUP'; end if;
 select * into u from public.users where id=p_user_id for update;if not found then raise exception 'USER_NOT_FOUND';end if;
 if u.account_status in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if u.main_wallet_balance<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
 select * into inv from public.zynth_investments where id=p_investment_id and user_id=p_user_id for update;
 if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
 if exists(select 1 from public.zynth_redemption_requests r where r.investment_id=inv.id and r.status in ('pending','approved','processing')) then raise exception 'REDEMPTION_PENDING'; end if;
 select * into s from public.zynth_strategies where id=inv.strategy_id for update;if not found or s.status<>'active' or coalesce(s.risk_frozen,false) then raise exception 'STRATEGY_UNAVAILABLE';end if;
 if s.maximum_investment is not null and inv.principal_remaining+p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
 select coalesce(sum(i.current_value),0),coalesce(sum(i.current_value) filter(where i.user_id=p_user_id),0) into v_aum,v_investor from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 select coalesce(sum(d.amount),0) into v_reserved from public.deposit_requests d where d.status='pending' and (d.user_note like 'INVESTMENT_TOPUP='||s.id::text or d.user_note like 'CRYPTO_INVESTMENT_TOPUP='||s.id::text);
 if s.maximum_capacity is not null and v_aum+v_reserved+p_amount>s.maximum_capacity then raise exception 'STRATEGY_CAPACITY_REACHED'; end if;
 if s.maximum_aum is not null and v_aum+p_amount>s.maximum_aum then raise exception 'STRATEGY_RISK_AUM_LIMIT'; end if;
 if s.maximum_investor_allocation is not null and v_investor+p_amount>s.maximum_investor_allocation then raise exception 'INVESTOR_ALLOCATION_LIMIT'; end if;
 if s.maximum_strategy_allocation_pct is not null and coalesce(s.maximum_aum,s.maximum_capacity) is not null and v_investor+p_amount>coalesce(s.maximum_aum,s.maximum_capacity)*s.maximum_strategy_allocation_pct/100 then raise exception 'STRATEGY_ALLOCATION_LIMIT'; end if;
 units:=p_amount/nullif(s.nav,0); if units is null or units<=0 then raise exception 'INVALID_STRATEGY_NAV'; end if;
 new_units:=inv.units+units; new_principal:=inv.principal+p_amount;
 update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
 update public.zynth_investments set principal=new_principal,principal_remaining=principal_remaining+p_amount,units=new_units,entry_nav=new_principal/nullif(new_units,0),current_value=current_value+p_amount,updated_at=now() where id=inv.id;
 update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
 insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata) values(inv.id,p_user_id,inv.strategy_id,'adjusted',p_amount,units,s.nav,jsonb_build_object('action','topup','previous_units',inv.units,'previous_principal',inv.principal));
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'investment',p_amount,'completed','ZYN-TOP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),jsonb_build_object('source','investment_topup','investment_id',inv.id,'strategy_id',inv.strategy_id,'nav',s.nav,'units',units));
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'investment.topup','zynth_investment',inv.id,jsonb_build_object('amount',p_amount,'units',units,'nav',s.nav));
 insert into public.notifications(user_id,title,body,type,metadata) values(p_user_id,'Investment topped up','₦'||to_char(p_amount,'FM999G999G999G990D00')||' has been added to your '||s.name||' at NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||'.','investment',jsonb_build_object('investment_id',inv.id,'amount',p_amount,'units_added',units,'nav',s.nav));
 return jsonb_build_object('ok',true,'investment_id',inv.id,'strategy_id',inv.strategy_id,'amount',p_amount,'units_added',units,'nav',s.nav);
end; $function$;


-- Phase 7/8 hardening: risk evaluation must run whenever a strategy NAV is
-- authoritatively settled/reported, not only when a client opens an investment.
create or replace function public.zynth_strategy_risk_evaluate(
  p_strategy_id uuid,p_new_nav numeric,p_previous_nav numeric,p_report_return_pct numeric
) returns jsonb
language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare s public.zynth_strategies%rowtype; dd numeric:=0; aum numeric:=0;
 breached text[]:=array[]::text[]; reason text; action text:='NONE'; frozen boolean:=false;
begin
 select * into s from public.zynth_strategies where id=p_strategy_id for update;
 if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
 if p_new_nav is null or p_new_nav<=0 then raise exception 'INVALID_NAV'; end if;
 if s.high_water_mark>0 then dd:=(p_new_nav/s.high_water_mark-1)*100; end if;
 select coalesce(sum(i.units*p_new_nav),0) into aum
 from public.zynth_investments i where i.strategy_id=s.id and i.status='active';

 if s.maximum_aum is not null and aum>s.maximum_aum then breached:=array_append(breached,'MAXIMUM_AUM'); end if;
 if s.maximum_drawdown_pct is not null and dd<=-abs(s.maximum_drawdown_pct) then breached:=array_append(breached,'MAXIMUM_DRAWDOWN'); end if;
 if s.daily_loss_limit_pct is not null and p_report_return_pct<=-abs(s.daily_loss_limit_pct) then breached:=array_append(breached,'DAILY_LOSS_LIMIT'); end if;
 if s.emergency_freeze_threshold_pct is not null and dd<=-abs(s.emergency_freeze_threshold_pct) then breached:=array_append(breached,'EMERGENCY_FREEZE'); end if;

 if coalesce(array_length(breached,1),0)>0 then
   frozen:=true; action:='STRATEGY_PAUSED'; reason:=array_to_string(breached,', ');
   update public.zynth_strategies
   set status='paused',risk_frozen=true,risk_freeze_reason=reason,
       risk_frozen_at=coalesce(risk_frozen_at,now()),risk_last_evaluated_at=now(),updated_at=now()
   where id=s.id;
   -- Only emit a new admin alert on the transition into the frozen state.
   if not coalesce(s.risk_frozen,false) then
     insert into public.zynth_strategy_risk_events(strategy_id,event_type,threshold_value,observed_value,action,reason)
     values(s.id,coalesce(breached[1],'RISK_THRESHOLD'),null,dd,action,reason);
     perform public.zynth_emit_admin_notification(
       'strategy.risk.freeze','Strategy paused — risk threshold breached',
       s.name||' has been automatically paused. New investments are disabled. Trigger: '||reason,
       'risk','critical','/admin/strategies');
   end if;
 else
   update public.zynth_strategies set risk_last_evaluated_at=now(),updated_at=now() where id=s.id;
 end if;
 return jsonb_build_object('strategy_id',s.id,'drawdown_pct',dd,'daily_return_pct',p_report_return_pct,
   'aum',aum,'breached',to_jsonb(breached),'frozen',frozen,'action',action);
end $function$;

revoke all on function public.zynth_strategy_risk_evaluate(uuid,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.zynth_strategy_risk_evaluate(uuid,numeric,numeric,numeric) to service_role;
