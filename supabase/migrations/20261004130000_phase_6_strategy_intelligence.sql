-- Phase 6: Strategy Intelligence and authoritative capacity/liquidity controls
alter table public.zynth_strategies add column if not exists maximum_capacity numeric, add column if not exists redemption_window_days integer, add column if not exists processing_time_min_business_days integer, add column if not exists processing_time_max_business_days integer, add column if not exists lock_period_days integer;
alter table public.zynth_strategies drop constraint if exists zynth_strategies_capacity_nonnegative;
alter table public.zynth_strategies add constraint zynth_strategies_capacity_nonnegative check (maximum_capacity is null or maximum_capacity > 0);
alter table public.zynth_strategies drop constraint if exists zynth_strategies_liquidity_valid;
alter table public.zynth_strategies add constraint zynth_strategies_liquidity_valid check ((redemption_window_days is null or redemption_window_days >= 1) and (processing_time_min_business_days is null or processing_time_min_business_days >= 0) and (processing_time_max_business_days is null or processing_time_max_business_days >= coalesce(processing_time_min_business_days,0)) and (lock_period_days is null or lock_period_days >= 0));
create index if not exists zynth_nav_history_strategy_date_idx on public.zynth_nav_history(strategy_id,nav_date);
create index if not exists zynth_investments_strategy_status_idx on public.zynth_investments(strategy_id,status);

CREATE OR REPLACE FUNCTION public.zynth_create_investment(p_user_id uuid, p_strategy_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u public.users%rowtype;s public.zynth_strategies%rowtype;inv uuid;units numeric;enabled boolean;entry boolean;v_aum numeric;v_pending numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select investment_enabled,strategy_entry_enabled into enabled,entry from public.system_settings limit 1;
 if not coalesce(enabled,false) or not coalesce(entry,false) then raise exception 'INVESTMENTS_DISABLED'; end if;
 select * into u from public.users where id=p_user_id for update;if not found then raise exception 'USER_NOT_FOUND';end if;
 select * into s from public.zynth_strategies where id=p_strategy_id for update;if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE';end if;
 if s.minimum_investment>0 and p_amount<s.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT';end if;
 if s.maximum_investment is not null and p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT';end if;
 select coalesce(sum(i.current_value),0) into v_aum from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 if s.maximum_capacity is not null and v_aum+p_amount>s.maximum_capacity then raise exception 'STRATEGY_CAPACITY_REACHED'; end if;
 if u.main_wallet_balance<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE';end if;
 units:=p_amount/nullif(s.nav,0);
 update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
 insert into public.zynth_investments(user_id,strategy_id,principal,principal_remaining,units,entry_nav,current_value,status) values(p_user_id,p_strategy_id,p_amount,p_amount,units,s.nav,p_amount,'active') returning id into inv;
 update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
 insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav) values(inv,p_user_id,p_strategy_id,'created',p_amount,units,s.nav);
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'investment',p_amount,'completed','ZYN-INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),jsonb_build_object('strategy_id',p_strategy_id,'investment_id',inv,'nav',s.nav,'units',units));
 return jsonb_build_object('investment_id',inv,'amount',p_amount,'units',units,'nav',s.nav);
end; $function$


CREATE OR REPLACE FUNCTION public.zynth_admin_list_strategies(p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'name',s.name,'description',s.description,'status',s.status,'nav',s.nav,
   'starting_balance',s.starting_balance,'current_reported_balance',s.current_reported_balance,
   'minimum_investment',s.minimum_investment,'maximum_investment',s.maximum_investment,
   'maximum_capacity',s.maximum_capacity,'redemption_window_days',s.redemption_window_days,
   'processing_time_min_business_days',s.processing_time_min_business_days,'processing_time_max_business_days',s.processing_time_max_business_days,
   'lock_period_days',s.lock_period_days,
   'current_aum',coalesce((select sum(i.units*s.nav) from public.zynth_investments i where i.strategy_id=s.id and i.status='active'),0),
   'trader_id',s.trader_id,'trader_name',coalesce(tp.display_name,u.full_name,u.email,'Unassigned'),
   'trader_email',u.email,'created_at',s.created_at,'updated_at',s.updated_at
 ) order by s.created_at desc) from public.zynth_strategies s left join public.users u on u.id=s.trader_id left join public.zynth_trader_profiles tp on tp.user_id=s.trader_id),'[]'::jsonb);
end $function$


CREATE OR REPLACE FUNCTION public.zynth_public_strategies()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'name',s.name,'description',s.description,'nav',s.nav,
   'minimum_investment',s.minimum_investment,'maximum_investment',s.maximum_investment,
   'maximum_capacity',s.maximum_capacity,
   'current_aum',coalesce((select sum(i.units*s.nav) from public.zynth_investments i where i.strategy_id=s.id and i.status='active'),0),
   'available_capacity',case when s.maximum_capacity is null then null else greatest(s.maximum_capacity-
      coalesce((select sum(i.units*s.nav) from public.zynth_investments i where i.strategy_id=s.id and i.status='active'),0)-
      coalesce((select sum(d.amount) from public.deposit_requests d where d.status='pending' and (d.user_note like 'INVESTMENT_STRATEGY='||s.id::text or d.user_note like 'CRYPTO_INVESTMENT_STRATEGY='||s.id::text or d.user_note like 'INVESTMENT_TOPUP='||s.id::text or d.user_note like 'CRYPTO_INVESTMENT_TOPUP='||s.id::text)),0),0) end,
   'accepting_new_capital',case when s.maximum_capacity is null then true else greatest(s.maximum_capacity-
      coalesce((select sum(i.units*s.nav) from public.zynth_investments i where i.strategy_id=s.id and i.status='active'),0)-
      coalesce((select sum(d.amount) from public.deposit_requests d where d.status='pending' and (d.user_note like 'INVESTMENT_STRATEGY='||s.id::text or d.user_note like 'CRYPTO_INVESTMENT_STRATEGY='||s.id::text or d.user_note like 'INVESTMENT_TOPUP='||s.id::text or d.user_note like 'CRYPTO_INVESTMENT_TOPUP='||s.id::text)),0),0)>0 end,
   'redemption_window_days',s.redemption_window_days,'processing_time_min_business_days',s.processing_time_min_business_days,
   'processing_time_max_business_days',s.processing_time_max_business_days,'lock_period_days',s.lock_period_days,
   'status',s.status
 ) order by s.created_at desc),'[]'::jsonb)
 from public.zynth_strategies s where s.status='active';
$function$


CREATE OR REPLACE FUNCTION public.zynth_create_topup(p_user_id uuid, p_investment_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u public.users%rowtype;inv public.zynth_investments%rowtype;s public.zynth_strategies%rowtype;st public.system_settings%rowtype;units numeric;new_units numeric;new_principal numeric;v_aum numeric;
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
 select * into s from public.zynth_strategies where id=inv.strategy_id for update;if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE';end if;
 if s.maximum_investment is not null and inv.principal_remaining+p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
 select coalesce(sum(i.current_value),0) into v_aum from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 if s.maximum_capacity is not null and v_aum+p_amount>s.maximum_capacity then raise exception 'STRATEGY_CAPACITY_REACHED'; end if;
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
end; $function$


CREATE OR REPLACE FUNCTION public.create_topup_deposit_request(p_user_id uuid, p_investment_id uuid, p_amount numeric, p_method text DEFAULT 'manual'::text)
 RETURNS deposit_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.deposit_requests;inv public.zynth_investments%rowtype;s public.zynth_strategies%rowtype;st public.system_settings%rowtype;dep_ref text;pay_ref text;fee numeric;total numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select * into st from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not st.deposits_enabled or not st.topup_enabled then raise exception 'TOPUPS_DISABLED'; end if;
 if p_amount<st.topup_min_amount then raise exception 'BELOW_MINIMUM_TOPUP'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 select * into inv from public.zynth_investments where id=p_investment_id and user_id=p_user_id for update;
 if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
 select * into s from public.zynth_strategies where id=inv.strategy_id for update;
 if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
 if s.maximum_investment is not null and inv.principal_remaining+p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
 perform public.zynth_strategy_capacity_check(s.id,p_amount);
 fee:=round((p_amount*coalesce(st.deposit_fee_pct,0)/100)+coalesce(st.deposit_fee_fixed,0),2); total:=round(p_amount+fee,2);
 dep_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)); pay_ref:='ZYN-TOPUP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.deposit_requests(user_id,amount,method,status,reference,payment_reference,user_note,fee_amount,total_amount,fee_pct,fee_fixed_amount)
 values(p_user_id,p_amount,p_method,'pending',dep_ref,pay_ref,'INVESTMENT_TOPUP='||p_investment_id::text,fee,total,coalesce(st.deposit_fee_pct,0),coalesce(st.deposit_fee_fixed,0)) returning * into d;
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'deposit',p_amount,'pending',dep_ref,jsonb_build_object('source','topup_deposit_request','topup_intent',true,'investment_id',p_investment_id,'strategy_id',inv.strategy_id,'deposit_request_id',d.id,'method',p_method,'payment_reference',pay_ref,'deposit_fee_amount',fee,'deposit_total_amount',total));
 if fee>0 then insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'fee_deduction',fee,'pending','FEE-DEP-'||d.id::text,jsonb_build_object('deposit_request_id',d.id,'source','deposit','fee_pct',coalesce(st.deposit_fee_pct,0),'fee_fixed_amount',coalesce(st.deposit_fee_fixed,0))); end if;
 return d;
end $function$


CREATE OR REPLACE FUNCTION public.zynth_admin_process_deposit_v2(p_admin_user_id uuid, p_deposit_id uuid, p_approved boolean, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.deposit_requests; tx public.transactions; inv public.zynth_investments%rowtype; s public.zynth_strategies%rowtype; units numeric; new_units numeric; new_principal numeric; strategy_id uuid; investment_id uuid;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 select * into d from public.deposit_requests where id=p_deposit_id for update;
 if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
 if d.status<>'pending' then raise exception 'DEPOSIT_ALREADY_PROCESSED'; end if;
 select * into tx from public.transactions where reference=d.reference and status='pending' for update;
 if not found then raise exception 'DEPOSIT_TRANSACTION_NOT_FOUND'; end if;
 if not p_approved then
   update public.deposit_requests set status='rejected',admin_note=coalesce(nullif(trim(p_admin_note),''),'Payment request rejected'),processed_at=now(),processed_by=auth.uid() where id=d.id;
   update public.transactions set status='failed',failure_reason=coalesce(nullif(trim(p_admin_note),''),'Payment request rejected'),processed_at=now() where id=tx.id;
   insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'deposit.rejected','deposit_request',d.id,jsonb_build_object('amount',d.amount,'user_id',d.user_id,'reference',d.reference));
   return jsonb_build_object('ok',true,'status','rejected');
 end if;
 investment_id:=nullif(tx.metadata->>'investment_id','')::uuid;
 strategy_id:=nullif(tx.metadata->>'strategy_id','')::uuid;
 if coalesce(tx.metadata->>'topup_intent','false')='true' then
   select * into inv from public.zynth_investments where id=investment_id and user_id=d.user_id for update;
   if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
   select * into s from public.zynth_strategies where id=inv.strategy_id for update;
   if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
   if s.maximum_investment is not null and inv.principal_remaining+d.amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
   perform public.zynth_strategy_capacity_check(s.id,d.amount);
   units:=d.amount/nullif(s.nav,0); if units is null or units<=0 then raise exception 'INVALID_STRATEGY_NAV'; end if;
   new_units:=inv.units+units; new_principal:=inv.principal+d.amount;
   update public.zynth_investments set principal=new_principal,principal_remaining=principal_remaining+d.amount,units=new_units,entry_nav=new_principal/nullif(new_units,0),current_value=current_value+d.amount,updated_at=now() where id=inv.id;
   update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
   update public.transactions set status='completed',processed_at=now(),metadata=metadata||jsonb_build_object('auto_topped_up',true,'nav',s.nav,'units',units) where id=tx.id;
   insert into public.transactions(user_id,type,amount,status,reference,metadata) values(d.user_id,'investment',d.amount,'completed','ZYN-TOP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),jsonb_build_object('source','deposit_topup','investment_id',inv.id,'strategy_id',s.id,'nav',s.nav,'units',units,'deposit_request_id',d.id));
   insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata) values(inv.id,d.user_id,s.id,'adjusted',d.amount,units,s.nav,jsonb_build_object('action','topup','source','deposit'));
   update public.deposit_requests set status='confirmed',admin_note=nullif(trim(p_admin_note),''),processed_at=now(),processed_by=auth.uid() where id=d.id;
   insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'deposit.confirmed.topup','deposit_request',d.id,jsonb_build_object('amount',d.amount,'investment_id',inv.id,'strategy_id',s.id,'nav',s.nav,'units',units));
   insert into public.notifications(user_id,title,body,type,metadata) values(d.user_id,'Top-up confirmed','Your ₦'||to_char(d.amount,'FM999G999G999G990D00')||' top-up has been added to '||s.name||' at NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||'.','investment',jsonb_build_object('investment_id',inv.id,'amount',d.amount,'units_added',units,'nav',s.nav));
   return jsonb_build_object('ok',true,'status','confirmed','topup',true,'investment_id',inv.id,'strategy_id',s.id,'units_added',units,'nav',s.nav);
 elsif strategy_id is not null then
   select * into s from public.zynth_strategies where id=strategy_id for update;
   if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
   perform public.zynth_strategy_capacity_check(s.id,d.amount);
   units:=d.amount/nullif(s.nav,0); if units is null or units<=0 then raise exception 'INVALID_STRATEGY_NAV'; end if;
   insert into public.zynth_investments(user_id,strategy_id,principal,principal_remaining,units,entry_nav,current_value,status) values(d.user_id,s.id,d.amount,d.amount,units,s.nav,d.amount,'active') returning id into investment_id;
   update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
   update public.transactions set status='completed',processed_at=now(),metadata=metadata||jsonb_build_object('auto_invested',true,'nav',s.nav,'units',units) where id=tx.id;
   insert into public.transactions(user_id,type,amount,status,reference,metadata) values(d.user_id,'investment',d.amount,'completed','ZYN-INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),jsonb_build_object('source','deposit_auto_invest','strategy_id',s.id,'investment_id',investment_id,'nav',s.nav,'units',units,'deposit_request_id',d.id));
   insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav) values(investment_id,d.user_id,s.id,'created',d.amount,units,s.nav);
   update public.deposit_requests set status='confirmed',admin_note=nullif(trim(p_admin_note),''),processed_at=now(),processed_by=auth.uid() where id=d.id;
   insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'deposit.confirmed.auto_invested','deposit_request',d.id,jsonb_build_object('amount',d.amount,'strategy_id',s.id,'investment_id',investment_id,'nav',s.nav,'units',units));
   return jsonb_build_object('ok',true,'status','confirmed','auto_invested',true,'investment_id',investment_id,'strategy_id',s.id,'nav',s.nav,'units',units);
 else
   perform public.credit_deposit(d.user_id,d.amount,d.reference);
   update public.deposit_requests set status='confirmed',admin_note=nullif(trim(p_admin_note),''),processed_at=now(),processed_by=auth.uid() where id=d.id;
   insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'deposit.confirmed','deposit_request',d.id,jsonb_build_object('amount',d.amount,'user_id',d.user_id,'reference',d.reference));
   return jsonb_build_object('ok',true,'status','confirmed','auto_invested',false);
 end if;
end $function$


CREATE OR REPLACE FUNCTION public.create_crypto_deposit_request(p_user_id uuid, p_amount numeric, p_strategy_id uuid DEFAULT NULL::uuid, p_investment_id uuid DEFAULT NULL::uuid)
 RETURNS deposit_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.deposit_requests;st public.system_settings%rowtype;inv public.zynth_investments%rowtype;strat public.zynth_strategies%rowtype;fee numeric;total numeric;dep_ref text;pay_ref text;account_state text;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 if p_strategy_id is null and p_investment_id is null then raise exception 'FUNDING_TARGET_REQUIRED'; end if;
 if p_strategy_id is not null and p_investment_id is not null then raise exception 'MULTIPLE_FUNDING_TARGETS'; end if;
 select account_status into account_state from public.users where id=p_user_id;
 if account_state is null then raise exception 'USER_NOT_FOUND'; end if;
 if account_state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 if exists(select 1 from public.transactions where user_id=p_user_id and type='withdrawal' and status='pending') then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
 select * into st from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not st.deposits_enabled then raise exception 'DEPOSITS_DISABLED'; end if;
 if p_amount<st.global_min_deposit then raise exception 'BELOW_MINIMUM'; end if;
 if p_strategy_id is not null then
   select * into strat from public.zynth_strategies where id=p_strategy_id for update;
   if not found or strat.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
   if strat.minimum_investment>0 and p_amount<strat.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT'; end if;
   if strat.maximum_investment is not null and p_amount>strat.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
   perform public.zynth_strategy_capacity_check(strat.id,p_amount);
 else
   select * into inv from public.zynth_investments where id=p_investment_id and user_id=p_user_id for update;
   if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
   if exists(select 1 from public.zynth_redemption_requests r where r.investment_id=inv.id and r.status in ('pending','approved','processing')) then raise exception 'REDEMPTION_PENDING'; end if;
   select * into strat from public.zynth_strategies where id=inv.strategy_id for update;
   if not found or strat.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
   if not st.topup_enabled then raise exception 'TOPUPS_DISABLED'; end if;
   if p_amount<st.topup_min_amount then raise exception 'BELOW_MINIMUM_TOPUP'; end if;
   if strat.maximum_investment is not null and inv.principal_remaining+p_amount>strat.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
   perform public.zynth_strategy_capacity_check(strat.id,p_amount);
 end if;
 fee:=round((p_amount*coalesce(st.deposit_fee_pct,0)/100)+coalesce(st.deposit_fee_fixed,0),2); total:=round(p_amount+fee,2);
 dep_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)); pay_ref:='ZYN-CRYPTO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.deposit_requests(user_id,amount,method,status,reference,payment_reference,user_note,fee_amount,total_amount,fee_pct,fee_fixed_amount)
 values(p_user_id,p_amount,'crypto','pending',dep_ref,pay_ref,case when p_strategy_id is not null then 'CRYPTO_INVESTMENT_STRATEGY='||p_strategy_id::text else 'CRYPTO_INVESTMENT_TOPUP='||p_investment_id::text end,fee,total,coalesce(st.deposit_fee_pct,0),coalesce(st.deposit_fee_fixed,0)) returning * into d;
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'deposit',p_amount,'pending',dep_ref,jsonb_build_object('source','crypto_deposit_request','deposit_request_id',d.id,'method','crypto','payment_reference',pay_ref,'investment_intent',true,'strategy_id',coalesce(p_strategy_id,inv.strategy_id),'investment_id',p_investment_id,'funding_intent',case when p_strategy_id is not null then 'new_investment' else 'investment_topup' end,'deposit_fee_amount',fee,'deposit_total_amount',total));
 if fee>0 then insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'fee_deduction',fee,'pending','FEE-DEP-'||d.id::text,jsonb_build_object('deposit_request_id',d.id,'source','deposit','fee_pct',coalesce(st.deposit_fee_pct,0),'fee_fixed_amount',coalesce(st.deposit_fee_fixed,0))); end if;
 return d;
end $function$


CREATE OR REPLACE FUNCTION public.zynth_strategy_intelligence(p_strategy_id uuid, p_period text DEFAULT 'since_inception'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s public.zynth_strategies%rowtype;
  v_latest_date date;
  v_anchor_date date;
  v_period_days integer;
  v_perf numeric := 0;
  v_max_dd numeric := 0;
  v_worst numeric;
  v_best numeric;
  v_vol numeric;
  v_losing integer := 0;
  v_winning integer := 0;
  v_total_days integer := 0;
  v_recovery_days integer;
  v_current_dd numeric := 0;
  v_streak integer := 0;
  v_streak_direction text := 'NONE';
  v_avg_month numeric;
  v_avg_win_month numeric;
  v_avg_loss_month numeric;
  v_current_aum numeric := 0;
  v_available_capacity numeric;
  v_pending_reserved numeric := 0;
  v_max_capacity numeric;
  v_series jsonb;
  v_months jsonb;
  v_trailing_peak numeric;
  v_trough_date date;
  v_trough_peak numeric;
  v_recovery_date date;
  r record;
  v_first_nav numeric;
  v_last_nav numeric;
  v_sign integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_strategy_id is null then raise exception 'STRATEGY_REQUIRED'; end if;
  if lower(coalesce(p_period,'')) not in ('7d','30d','90d','since_inception') then
    raise exception 'INVALID_PERIOD';
  end if;

  select * into s from public.zynth_strategies where id=p_strategy_id;
  if not found or s.status='archived' then raise exception 'STRATEGY_UNAVAILABLE'; end if;

  select max(nav_date) into v_latest_date
  from public.zynth_nav_history where strategy_id=p_strategy_id;
  if v_latest_date is null then
    return jsonb_build_object(
      'strategy', jsonb_build_object(
        'id',s.id,'name',s.name,'description',s.description,'status',s.status,
        'currency',s.currency,'nav',s.nav
      ),
      'period',lower(p_period),
      'data_available',false,
      'performance',jsonb_build_object('return_pct',0),
      'risk',jsonb_build_object('maximum_drawdown_pct',0,'worst_day_pct',null,'best_day_pct',null,'volatility_pct',null,'recovery_days',null,'losing_days',0,'losing_days_pct',0,'winning_days',0,'winning_days_pct',0),
      'behaviour',jsonb_build_object('average_monthly_return_pct',null,'average_winning_month_pct',null,'average_losing_month_pct',null,'current_drawdown_pct',0,'current_streak',0,'current_streak_direction','NONE'),
      'capacity',jsonb_build_object('current_aum',0,'maximum_capacity',s.maximum_capacity,'available_capacity',s.maximum_capacity,'pending_reserved',0,'accepting_new_capital',case when s.status='active' and s.maximum_capacity is not null then true else s.status='active' end),
      'liquidity',jsonb_build_object('redemption_window_days',s.redemption_window_days,'processing_time_min_business_days',s.processing_time_min_business_days,'processing_time_max_business_days',s.processing_time_max_business_days,'lock_period_days',s.lock_period_days),
      'series','[]'::jsonb,'months','[]'::jsonb
    );
  end if;

  v_period_days := case lower(p_period) when '7d' then 7 when '30d' then 30 when '90d' then 90 else null end;
  if v_period_days is null then
    select min(nav_date) into v_anchor_date from public.zynth_nav_history where strategy_id=p_strategy_id;
  else
    select coalesce(max(nav_date) filter(where nav_date <= v_latest_date-v_period_days),
                    min(nav_date))
    into v_anchor_date
    from public.zynth_nav_history where strategy_id=p_strategy_id;
  end if;

  select nav into v_first_nav
  from public.zynth_nav_history
  where strategy_id=p_strategy_id and nav_date=v_anchor_date
  order by id limit 1;

  select nav into v_last_nav
  from public.zynth_nav_history
  where strategy_id=p_strategy_id and nav_date=v_latest_date
  order by id desc limit 1;

  if v_first_nav is not null and v_first_nav <> 0 then
    v_perf := (v_last_nav/v_first_nav-1)*100;
  end if;

  with p as (
    select nav_date,nav,previous_nav,
           case when previous_nav>0 then (nav/previous_nav-1)*100 end as daily_return
    from public.zynth_nav_history
    where strategy_id=p_strategy_id and nav_date>=v_anchor_date
  ),
  x as (
    select *, max(nav) over(order by nav_date rows between unbounded preceding and current row) as peak
    from p
  )
  select
    coalesce(min((nav/peak-1)*100),0),
    min(daily_return) filter(where nav_date>v_anchor_date),
    max(daily_return) filter(where nav_date>v_anchor_date),
    stddev_samp(daily_return) filter(where nav_date>v_anchor_date and daily_return is not null),
    count(*) filter(where nav_date>v_anchor_date and daily_return<0),
    count(*) filter(where nav_date>v_anchor_date and daily_return>0),
    count(*) filter(where nav_date>v_anchor_date and daily_return is not null)
  into v_max_dd,v_worst,v_best,v_vol,v_losing,v_winning,v_total_days
  from x;

  select q.nav_date,q.nav,q.peak
  into v_trough_date,v_last_nav,v_trough_peak
  from (
    with p as (
      select nav_date,nav,previous_nav
      from public.zynth_nav_history
      where strategy_id=p_strategy_id and nav_date>=v_anchor_date
    ), x as (
      select *,max(nav) over(order by nav_date rows between unbounded preceding and current row) peak
      from p
    )
    select *, (nav/peak-1)*100 dd from x
  ) q
  order by q.dd asc,q.nav_date desc limit 1;

  if coalesce(v_max_dd,0) < 0 then
    select min(h.nav_date) into v_recovery_date
    from public.zynth_nav_history h
    where h.strategy_id=p_strategy_id
      and h.nav_date>v_trough_date
      and h.nav>=v_trough_peak;
    if v_recovery_date is not null then
      v_recovery_days := v_recovery_date-v_trough_date;
    end if;
  else
    v_recovery_days := 0;
  end if;

  select nav into v_last_nav from public.zynth_nav_history
  where strategy_id=p_strategy_id and nav_date=v_latest_date order by id desc limit 1;
  select max(nav) into v_trailing_peak from public.zynth_nav_history
  where strategy_id=p_strategy_id and nav_date<=v_latest_date;
  if v_trailing_peak is not null and v_trailing_peak>0 then
    v_current_dd := (v_last_nav/v_trailing_peak-1)*100;
  end if;

  v_streak := 0;
  v_streak_direction := 'NONE';
  select case when daily_return>0 then 1 when daily_return<0 then -1 else 0 end
  into v_sign
  from (
    select (nav/previous_nav-1)*100 daily_return
    from public.zynth_nav_history
    where strategy_id=p_strategy_id and nav_date<=v_latest_date and previous_nav>0
    order by nav_date desc
  ) q limit 1;

  if v_sign is not null and v_sign<>0 then
    v_streak_direction := case when v_sign>0 then 'WINNING' else 'LOSING' end;
    for r in
      select case when nav/previous_nav-1>0 then 1 when nav/previous_nav-1<0 then -1 else 0 end sign
      from public.zynth_nav_history
      where strategy_id=p_strategy_id and nav_date<=v_latest_date and previous_nav>0
      order by nav_date desc
    loop
      exit when r.sign<>v_sign;
      v_streak := v_streak+1;
    end loop;
  end if;

  with scoped as (
    select nav_date,nav
    from public.zynth_nav_history
    where strategy_id=p_strategy_id and nav_date>=v_anchor_date
  ),
  monthly as (
    select date_trunc('month',nav_date)::date month_date,
           (array_agg(nav order by nav_date))[1] first_nav,
           (array_agg(nav order by nav_date desc))[1] last_nav
    from scoped group by 1
  )
  select
    avg((last_nav/first_nav-1)*100),
    avg((last_nav/first_nav-1)*100) filter(where last_nav>first_nav),
    avg((last_nav/first_nav-1)*100) filter(where last_nav<first_nav)
  into v_avg_month,v_avg_win_month,v_avg_loss_month
  from monthly;

  select coalesce(sum(i.current_value) filter(where i.status='active'),0)
  into v_current_aum from public.zynth_investments i where i.strategy_id=p_strategy_id;

  select coalesce(sum(d.amount),0) into v_pending_reserved
  from public.deposit_requests d
  where d.status='pending'
    and (
      d.user_note like 'CRYPTO_INVESTMENT_STRATEGY='||p_strategy_id::text
      or d.user_note like 'INVESTMENT_STRATEGY='||p_strategy_id::text
    );

  v_max_capacity := s.maximum_capacity;
  v_available_capacity := case when v_max_capacity is null then null else greatest(v_max_capacity-v_current_aum-v_pending_reserved,0) end;

  select coalesce(jsonb_agg(jsonb_build_object('date',nav_date,'nav',nav,'return_pct',case when previous_nav>0 then (nav/previous_nav-1)*100 else null end) order by nav_date),'[]'::jsonb)
  into v_series
  from public.zynth_nav_history
  where strategy_id=p_strategy_id and nav_date>=v_anchor_date;

  with scoped as (
    select nav_date,nav from public.zynth_nav_history where strategy_id=p_strategy_id and nav_date>=v_anchor_date
  ), monthly as (
    select date_trunc('month',nav_date)::date month_date,
           (array_agg(nav order by nav_date))[1] first_nav,
           (array_agg(nav order by nav_date desc))[1] last_nav
    from scoped group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('month',month_date,'return_pct',(last_nav/first_nav-1)*100) order by month_date),'[]'::jsonb)
  into v_months from monthly;

  return jsonb_build_object(
    'strategy',jsonb_build_object(
      'id',s.id,'name',s.name,'description',s.description,'status',s.status,'currency',s.currency,
      'nav',v_last_nav,'created_at',s.created_at
    ),
    'period',lower(p_period),'data_available',true,
    'performance',jsonb_build_object('return_pct',v_perf,'start_date',v_anchor_date,'end_date',v_latest_date),
    'risk',jsonb_build_object(
      'maximum_drawdown_pct',v_max_dd,'worst_day_pct',v_worst,'best_day_pct',v_best,'volatility_pct',v_vol,
      'recovery_days',v_recovery_days,'losing_days',v_losing,'losing_days_pct',case when v_total_days>0 then v_losing*100.0/v_total_days else 0 end,
      'winning_days',v_winning,'winning_days_pct',case when v_total_days>0 then v_winning*100.0/v_total_days else 0 end,
      'observed_days',v_total_days
    ),
    'behaviour',jsonb_build_object(
      'average_monthly_return_pct',v_avg_month,'average_winning_month_pct',v_avg_win_month,'average_losing_month_pct',v_avg_loss_month,
      'current_drawdown_pct',v_current_dd,'current_streak',v_streak,'current_streak_direction',v_streak_direction
    ),
    'capacity',jsonb_build_object(
      'current_aum',v_current_aum,'maximum_capacity',v_max_capacity,'available_capacity',v_available_capacity,
      'pending_reserved',v_pending_reserved,'accepting_new_capital',case when s.status<>'active' then false when v_max_capacity is null then true else v_available_capacity>0 end
    ),
    'liquidity',jsonb_build_object(
      'redemption_window_days',s.redemption_window_days,
      'processing_time_min_business_days',s.processing_time_min_business_days,
      'processing_time_max_business_days',s.processing_time_max_business_days,
      'lock_period_days',s.lock_period_days
    ),
    'series',v_series,'months',v_months
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.zynth_admin_set_strategy_intelligence_config(p_admin_id uuid, p_strategy_id uuid, p_maximum_capacity numeric, p_redemption_window_days integer, p_processing_time_min_business_days integer, p_processing_time_max_business_days integer, p_lock_period_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_before jsonb; v_after jsonb;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if not exists(select 1 from public.zynth_strategies where id=p_strategy_id) then raise exception 'STRATEGY_NOT_FOUND'; end if;
  if p_maximum_capacity is not null and p_maximum_capacity<=0 then raise exception 'INVALID_MAXIMUM_CAPACITY'; end if;
  if p_redemption_window_days is not null and p_redemption_window_days<1 then raise exception 'INVALID_REDEMPTION_WINDOW'; end if;
  if p_processing_time_min_business_days is not null and p_processing_time_min_business_days<0 then raise exception 'INVALID_PROCESSING_TIME'; end if;
  if p_processing_time_max_business_days is not null and p_processing_time_max_business_days<coalesce(p_processing_time_min_business_days,0) then raise exception 'INVALID_PROCESSING_TIME'; end if;
  if p_lock_period_days is not null and p_lock_period_days<0 then raise exception 'INVALID_LOCK_PERIOD'; end if;
  select to_jsonb(s) into v_before from public.zynth_strategies s where s.id=p_strategy_id;
  update public.zynth_strategies set maximum_capacity=p_maximum_capacity,redemption_window_days=p_redemption_window_days,processing_time_min_business_days=p_processing_time_min_business_days,processing_time_max_business_days=p_processing_time_max_business_days,lock_period_days=p_lock_period_days,updated_at=now() where id=p_strategy_id;
  select to_jsonb(s) into v_after from public.zynth_strategies s where s.id=p_strategy_id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'strategy.intelligence_config_changed','zynth_strategy',p_strategy_id,jsonb_build_object('before',v_before,'after',v_after));
  return v_after;
end; $function$


CREATE OR REPLACE FUNCTION public.zynth_strategy_capacity_check(p_strategy_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s public.zynth_strategies%rowtype; v_aum numeric; v_reserved numeric;
begin
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select * into s from public.zynth_strategies where id=p_strategy_id for update;
 if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
 if s.maximum_capacity is null then return; end if;
 select coalesce(sum(i.units*s.nav),0) into v_aum from public.zynth_investments i where i.strategy_id=s.id and i.status='active';
 select coalesce(sum(d.amount),0) into v_reserved from public.deposit_requests d
 where d.status='pending' and (
   d.user_note like 'INVESTMENT_STRATEGY='||s.id::text
   or d.user_note like 'CRYPTO_INVESTMENT_STRATEGY='||s.id::text
   or d.user_note like 'INVESTMENT_TOPUP='||s.id::text
   or d.user_note like 'CRYPTO_INVESTMENT_TOPUP='||s.id::text
 );
 if v_aum+v_reserved+p_amount>s.maximum_capacity then raise exception 'STRATEGY_CAPACITY_REACHED'; end if;
end $function$


revoke all on function public.zynth_strategy_intelligence(uuid,text) from public,anon,authenticated; grant execute on function public.zynth_strategy_intelligence(uuid,text) to authenticated;
revoke all on function public.zynth_strategy_capacity_check(uuid,numeric) from public,anon,authenticated;
revoke all on function public.zynth_admin_set_strategy_intelligence_config(uuid,uuid,numeric,integer,integer,integer,integer) from public,anon,authenticated; grant execute on function public.zynth_admin_set_strategy_intelligence_config(uuid,uuid,numeric,integer,integer,integer,integer) to authenticated;
revoke all on function public.zynth_public_strategies() from public,anon; grant execute on function public.zynth_public_strategies() to authenticated;
revoke all on function public.zynth_admin_list_strategies(uuid) from public,anon,authenticated; grant execute on function public.zynth_admin_list_strategies(uuid) to authenticated;
revoke all on function public.zynth_create_investment(uuid,uuid,numeric) from public; grant execute on function public.zynth_create_investment(uuid,uuid,numeric) to authenticated;
revoke all on function public.zynth_create_topup(uuid,uuid,numeric) from public; grant execute on function public.zynth_create_topup(uuid,uuid,numeric) to authenticated;
revoke all on function public.create_topup_deposit_request(uuid,uuid,numeric,text) from public,anon; grant execute on function public.create_topup_deposit_request(uuid,uuid,numeric,text) to authenticated;
revoke all on function public.create_crypto_deposit_request(uuid,numeric,uuid,uuid) from public,anon; grant execute on function public.create_crypto_deposit_request(uuid,numeric,uuid,uuid) to authenticated;
revoke all on function public.zynth_admin_process_deposit_v2(uuid,uuid,boolean,text) from public,anon,authenticated; grant execute on function public.zynth_admin_process_deposit_v2(uuid,uuid,boolean,text) to authenticated;