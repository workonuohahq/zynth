-- Phase 7 + Phase 8: strategy risk controls, automatic freeze, immutable vault statements
alter table public.zynth_strategies
 add column if not exists maximum_drawdown_pct numeric,
 add column if not exists daily_loss_limit_pct numeric,
 add column if not exists maximum_aum numeric,
 add column if not exists maximum_investor_allocation numeric,
 add column if not exists maximum_strategy_allocation_pct numeric,
 add column if not exists minimum_liquidity_reserve numeric,
 add column if not exists emergency_freeze_threshold_pct numeric,
 add column if not exists risk_frozen boolean not null default false,
 add column if not exists risk_freeze_reason text,
 add column if not exists risk_frozen_at timestamptz,
 add column if not exists risk_last_evaluated_at timestamptz;

create table if not exists public.zynth_strategy_risk_events(
 id uuid primary key default gen_random_uuid(),
 strategy_id uuid not null references public.zynth_strategies(id) on delete cascade,
 event_type text not null, threshold_value numeric, observed_value numeric,
 action text not null, reason text, created_at timestamptz not null default now()
);
alter table public.zynth_strategy_risk_events enable row level security;
revoke all on public.zynth_strategy_risk_events from anon,authenticated,public;
grant all on public.zynth_strategy_risk_events to service_role;

create table if not exists public.zynth_vault_statements(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 period_type text not null check(period_type in ('monthly','custom','since_inception')),
 period_start date not null, period_end date not null,
 version integer not null default 1,
 status text not null default 'final' check(status in ('final','revised')),
 snapshot jsonb not null, pdf_bytes bytea, content_hash text,
 generated_at timestamptz not null default now(),
 supersedes_id uuid references public.zynth_vault_statements(id),
 revision_reason text,
 unique(user_id,period_start,period_end,version),
 check(period_end>=period_start)
);
alter table public.zynth_vault_statements enable row level security;
revoke all on public.zynth_vault_statements from anon,authenticated,public;
grant all on public.zynth_vault_statements to service_role;
create index if not exists zynth_strategy_risk_events_strategy_idx on public.zynth_strategy_risk_events(strategy_id,created_at desc);
create index if not exists zynth_vault_statements_user_period_idx on public.zynth_vault_statements(user_id,period_end desc,period_start desc);

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
 if s.maximum_strategy_allocation_pct is not null and v_aum>0 and (v_investor+p_amount)/(v_aum+p_amount)*100>s.maximum_strategy_allocation_pct then raise exception 'STRATEGY_ALLOCATION_LIMIT'; end if;
 if u.main_wallet_balance<p_amount then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE';end if;
 units:=p_amount/nullif(s.nav,0);
 update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
 insert into public.zynth_investments(user_id,strategy_id,principal,principal_remaining,units,entry_nav,current_value,status) values(p_user_id,p_strategy_id,p_amount,p_amount,units,s.nav,p_amount,'active') returning id into inv;
 update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
 insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav) values(inv,p_user_id,p_strategy_id,'created',p_amount,units,s.nav);
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'investment',p_amount,'completed','ZYN-INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),jsonb_build_object('strategy_id',p_strategy_id,'investment_id',inv,'nav',s.nav,'units',units));
 return jsonb_build_object('investment_id',inv,'amount',p_amount,'units',units,'nav',s.nav);
end; $function$;

CREATE OR REPLACE FUNCTION public.zynth_admin_settle_report(p_report_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.zynth_daily_reports%rowtype;
  s public.zynth_strategies%rowtype;
  st public.zynth_settlements%rowtype;
  flow numeric;
  pnl numeric;
  ret numeric;
  previous_nav numeric;
  newnav numeric;
  beforev numeric;
  afterv numeric;
  investor_delta numeric;
  unrealized_alloc numeric;
  total_units numeric;
  unlock interval;
  inv record;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id
     or not public.zynth_has_role(auth.uid(),'admin')
     or not exists(select 1 from public.users where id=auth.uid() and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;

  select * into r from public.zynth_daily_reports where id=p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if r.status<>'pending' then raise exception 'REPORT_NOT_PENDING'; end if;

  select * into s from public.zynth_strategies where id=r.strategy_id for update;
  if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
  if s.status<>'active' then raise exception 'STRATEGY_NOT_ACTIVE'; end if;
  if r.trader_id<>s.trader_id then raise exception 'REPORT_TRADER_MISMATCH'; end if;
  if exists(
    select 1 from public.zynth_settlements
    where strategy_id=r.strategy_id and settlement_date=r.report_date and status='settled'
  ) then raise exception 'DATE_ALREADY_SETTLED'; end if;

  flow:=r.external_deposit-r.external_withdrawal;
  pnl:=r.trading_pnl;
  ret:=case when r.opening_balance=0 then 0 else pnl/r.opening_balance end;
  previous_nav:=s.nav;
  newnav:=round(previous_nav*(1+ret),8);
  if newnav<=0 then raise exception 'NAV_WOULD_BE_NONPOSITIVE'; end if;
 perform public.zynth_strategy_risk_evaluate(s.id,newnav,previous_nav,ret*100);

  select coalesce(sum(current_value),0)
    into beforev
    from public.zynth_investments
    where strategy_id=s.id and status='active';

  select coalesce(sum(units),0)
    into total_units
    from public.zynth_investments
    where strategy_id=s.id and status='active';

  update public.zynth_strategies
  set nav=newnav,
      current_reported_balance=r.closing_balance,
      high_water_mark=greatest(high_water_mark,newnav),
      updated_at=now()
  where id=s.id;

  for inv in
    select * from public.zynth_investments
    where strategy_id=s.id and status='active'
    for update
  loop
    investor_delta:=round(inv.units*(newnav-previous_nav),8);
    unrealized_alloc:=case
      when total_units=0 then 0
      else round(r.unrealized_pnl*(inv.units/total_units),8)
    end;

    update public.zynth_investments
    set current_value=round(units*newnav,8),
        unrealized_pnl=unrealized_alloc,
        realized_profit=realized_profit+greatest(investor_delta,0),
        realized_loss=realized_loss+greatest(-investor_delta,0),
        updated_at=now()
    where id=inv.id;
  end loop;

  select coalesce(sum(current_value),0)
    into afterv
    from public.zynth_investments
    where strategy_id=s.id and status='active';

  insert into public.zynth_settlements(
    strategy_id,report_id,settlement_date,opening_balance,closing_balance,
    external_net_flow,trading_pnl,return_pct,previous_nav,nav,
    investor_value_before,investor_value_after,settled_by
  )
  values(
    s.id,r.id,r.report_date,r.opening_balance,r.closing_balance,flow,pnl,ret*100,
    previous_nav,newnav,beforev,afterv,p_admin_id
  )
  returning * into st;

  unlock:=make_interval(days=>coalesce(
    (select vault_profit_lock_days from public.system_settings limit 1),30
  ));

  for inv in
    select * from public.zynth_investments
    where strategy_id=s.id and status='active'
  loop
    investor_delta:=round(inv.units*(newnav-previous_nav),8);

    if investor_delta>0 then
      insert into public.zynth_profit_lots(
        investment_id,settlement_id,user_id,strategy_id,profit_amount,generated_at,unlock_at
      )
      values(
        inv.id,st.id,inv.user_id,s.id,investor_delta,now(),now()+unlock
      );
    end if;

    insert into public.zynth_investment_events(
      investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata
    )
    values(
      inv.id,inv.user_id,s.id,'settled',investor_delta,inv.units,newnav,
      jsonb_build_object(
        'return_pct',ret*100,
        'settlement_id',st.id,
        'previous_nav',previous_nav,
        'new_nav',newnav,
        'investor_delta',investor_delta,
        'strategy_trading_pnl',r.trading_pnl,
        'strategy_realized_pnl',r.realized_pnl,
        'strategy_unrealized_pnl',r.unrealized_pnl
      )
    );
  end loop;

  insert into public.zynth_nav_history(
    strategy_id,nav_date,previous_nav,nav,return_pct,source_balance,
    performance_fee,settled_at,settlement_id
  )
  values(
    s.id,r.report_date,previous_nav,newnav,ret*100,r.closing_balance,0,now(),st.id
  )
  on conflict(strategy_id,nav_date) do update set
    previous_nav=excluded.previous_nav,
    nav=excluded.nav,
    return_pct=excluded.return_pct,
    source_balance=excluded.source_balance,
    settled_at=excluded.settled_at,
    settlement_id=excluded.settlement_id;

  update public.zynth_daily_reports
  set status='confirmed',
      trading_pnl=pnl,
      return_pct=ret*100,
      confirmed_at=now(),
      confirmed_by=p_admin_id
  where id=r.id;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(
    p_admin_id,'settlement.confirmed','zynth_settlement',st.id,
    jsonb_build_object(
      'strategy_id',s.id,
      'report_id',r.id,
      'return_pct',ret*100,
      'previous_nav',previous_nav,
      'nav',newnav,
      'strategy_trading_pnl',r.trading_pnl,
      'strategy_realized_pnl',r.realized_pnl,
      'strategy_unrealized_pnl',r.unrealized_pnl,
      'investor_value_before',beforev,
      'investor_value_after',afterv
    )
  );

  insert into public.notifications(user_id,title,body,type,metadata)
  select distinct i.user_id,
    'Strategy settlement confirmed',
    s.name||' settled at '||to_char(ret*100,'FM999990D00')||
      '%. Your position has been updated.',
    'settlement',
    jsonb_build_object(
      'strategy_id',s.id,
      'settlement_id',st.id,
      'return_pct',ret*100,
      'investor_value_before',beforev,
      'investor_value_after',afterv
    )
  from public.zynth_investments i
  where i.strategy_id=s.id and i.status='active';

  return jsonb_build_object(
    'settlement_id',st.id,
    'return_pct',ret*100,
    'nav',newnav,
    'investor_value_before',beforev,
    'investor_value_after',afterv,
    'strategy_trading_pnl',r.trading_pnl,
    'investor_pnl',afterv-beforev
  );
end;
$function$;

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
 if s.maximum_strategy_allocation_pct is not null and v_aum>0 and (v_investor+p_amount)/(v_aum+p_amount)*100>s.maximum_strategy_allocation_pct then raise exception 'STRATEGY_ALLOCATION_LIMIT'; end if;
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

CREATE OR REPLACE FUNCTION public.zynth_request_redemption(p_user_id uuid, p_investment_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare inv public.zynth_investments%rowtype; s public.zynth_strategies%rowtype; st public.system_settings%rowtype; gross numeric; units numeric; fee numeric; net numeric; ref text; rid uuid; release_at timestamptz; principal_part numeric; remaining_units numeric; remaining_value numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select * into st from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not st.investment_enabled or not st.strategy_exit_enabled then raise exception 'REDEMPTIONS_DISABLED'; end if;
 if p_amount<st.exit_minimum_amount then raise exception 'BELOW_MINIMUM_REDEMPTION'; end if;
 select * into inv from public.zynth_investments where id=p_investment_id and user_id=p_user_id for update;
 if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
 if exists(select 1 from public.zynth_redemption_requests r where r.investment_id=inv.id and r.status in ('pending','approved','processing')) then raise exception 'REDEMPTION_PENDING'; end if;
 select * into s from public.zynth_strategies where id=inv.strategy_id for update;
 if not found or s.status not in ('active','paused') then raise exception 'STRATEGY_UNAVAILABLE'; end if;
 gross:=round(inv.current_value,2);
 if s.minimum_liquidity_reserve is not null and coalesce(s.current_reported_balance,0)-p_amount<s.minimum_liquidity_reserve then raise exception 'STRATEGY_LIQUIDITY_RESERVE_REQUIRED'; end if;
 if p_amount>gross then raise exception 'INSUFFICIENT_INVESTMENT_VALUE'; end if;
 if not st.exit_allow_partial and p_amount<gross then raise exception 'FULL_REDEMPTION_ONLY'; end if;
 if p_amount>=gross then p_amount:=gross; end if;
 units:=round(p_amount/nullif(s.nav,0),12);
 if units<=0 or units>inv.units then raise exception 'INVALID_REDEMPTION_UNITS'; end if;
 fee:=round(p_amount*st.exit_fee_pct/100,2); net:=round(p_amount-fee,2);
 ref:='ZYN-RED-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
 release_at:=now()+make_interval(hours=>st.exit_delay_hours);
 principal_part:=round(inv.principal_remaining*(units/nullif(inv.units,0)),8);
 remaining_units:=round(inv.units-units,12); remaining_value:=round(inv.current_value-p_amount,8);
 insert into public.zynth_redemption_requests(user_id,investment_id,strategy_id,reference,requested_amount,requested_units,nav,gross_amount,fee_pct,fee_amount,net_amount,release_at,metadata)
 values(p_user_id,inv.id,inv.strategy_id,ref,p_amount,units,s.nav,p_amount,st.exit_fee_pct,fee,net,release_at,jsonb_build_object('valuation_basis','latest_confirmed_nav','principal_redeemed',principal_part,'delay_hours',st.exit_delay_hours)) returning id into rid;
 update public.zynth_investments set principal_remaining=greatest(0,principal_remaining-principal_part),units=remaining_units,current_value=remaining_value,status=case when remaining_units<=0.000000000001 then 'withdrawn' else 'active' end,updated_at=now() where id=inv.id;
 update public.zynth_strategies set total_units=greatest(0,total_units-units),updated_at=now() where id=s.id;
 insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata) values(inv.id,p_user_id,inv.strategy_id,'redeemed',p_amount,units,s.nav,jsonb_build_object('gross',p_amount,'fee',fee,'net',net,'reference',ref,'release_at',release_at,'principal_redeemed',principal_part));
 insert into public.transactions(user_id,type,amount,status,reference,metadata) values(p_user_id,'investment_redemption',p_amount,'pending',ref,jsonb_build_object('source','investment_redemption','redemption_id',rid,'investment_id',inv.id,'strategy_id',inv.strategy_id,'nav',s.nav,'units',units,'fee',fee,'net',net,'release_at',release_at));
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'investment.redemption_requested','zynth_redemption',rid,jsonb_build_object('investment_id',inv.id,'strategy_id',inv.strategy_id,'gross',p_amount,'fee',fee,'net',net,'units',units,'nav',s.nav,'release_at',release_at));
 insert into public.notifications(user_id,title,body,type,metadata) values(p_user_id,'Redemption requested','Your redemption of ₦'||to_char(p_amount,'FM999G999G999G990D00')||' is reserved at NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||'. Net proceeds of ₦'||to_char(net,'FM999G999G999G990D00')||' are scheduled for release after review and the configured processing window.','investment',jsonb_build_object('redemption_id',rid,'release_at',release_at,'gross',p_amount,'fee',fee,'net',net));
 return jsonb_build_object('ok',true,'redemption_id',rid,'reference',ref,'gross_amount',p_amount,'fee_amount',fee,'net_amount',net,'nav',s.nav,'units',units,'release_at',release_at,'status','pending');
exception when unique_violation then raise exception 'REDEMPTION_PENDING';
end; $function$;

CREATE OR REPLACE FUNCTION public.zynth_strategy_risk_evaluate(p_strategy_id uuid, p_new_nav numeric, p_previous_nav numeric, p_report_return_pct numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   frozen:=true; action:='STRATEGY_PAUSED';
   reason:=array_to_string(breached,', ');
   update public.zynth_strategies set status='paused',risk_frozen=true,risk_freeze_reason=reason,risk_frozen_at=coalesce(risk_frozen_at,now()),risk_last_evaluated_at=now(),updated_at=now() where id=s.id;
   insert into public.zynth_strategy_risk_events(strategy_id,event_type,threshold_value,observed_value,action,reason)
   values(s.id,coalesce(breached[1],'RISK_THRESHOLD'),null,dd,action,reason);
   perform public.zynth_emit_admin_notification('strategy.risk.freeze','Strategy paused — risk threshold breached',
     s.name||' has been automatically paused. New investments are disabled. Trigger: '||reason,
     'risk','critical','/admin/strategies');
 else
   update public.zynth_strategies set risk_last_evaluated_at=now(),updated_at=now() where id=s.id;
 end if;
 return jsonb_build_object('strategy_id',s.id,'drawdown_pct',dd,'daily_return_pct',p_report_return_pct,'aum',aum,'breached',to_jsonb(breached),'frozen',frozen,'action',action);
end $function$;

CREATE OR REPLACE FUNCTION public.zynth_admin_set_strategy_risk_controls(p_admin_id uuid, p_strategy_id uuid, p_maximum_drawdown_pct numeric, p_daily_loss_limit_pct numeric, p_maximum_aum numeric, p_maximum_investor_allocation numeric, p_maximum_strategy_allocation_pct numeric, p_minimum_liquidity_reserve numeric, p_emergency_freeze_threshold_pct numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare beforev jsonb;afterv jsonb;begin if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED';end if;if p_maximum_drawdown_pct is not null and p_maximum_drawdown_pct<=0 then raise exception 'INVALID_MAXIMUM_DRAWDOWN';end if;if p_daily_loss_limit_pct is not null and p_daily_loss_limit_pct<=0 then raise exception 'INVALID_DAILY_LOSS_LIMIT';end if;if p_maximum_aum is not null and p_maximum_aum<=0 then raise exception 'INVALID_MAXIMUM_AUM';end if;if p_maximum_investor_allocation is not null and p_maximum_investor_allocation<=0 then raise exception 'INVALID_MAXIMUM_INVESTOR_ALLOCATION';end if;if p_maximum_strategy_allocation_pct is not null and (p_maximum_strategy_allocation_pct<=0 or p_maximum_strategy_allocation_pct>100) then raise exception 'INVALID_MAXIMUM_STRATEGY_ALLOCATION';end if;if p_minimum_liquidity_reserve is not null and p_minimum_liquidity_reserve<0 then raise exception 'INVALID_LIQUIDITY_RESERVE';end if;if p_emergency_freeze_threshold_pct is not null and p_emergency_freeze_threshold_pct<=0 then raise exception 'INVALID_EMERGENCY_FREEZE_THRESHOLD';end if;select to_jsonb(s) into beforev from public.zynth_strategies s where s.id=p_strategy_id;if not found then raise exception 'STRATEGY_NOT_FOUND';end if;update public.zynth_strategies set maximum_drawdown_pct=p_maximum_drawdown_pct,daily_loss_limit_pct=p_daily_loss_limit_pct,maximum_aum=p_maximum_aum,maximum_investor_allocation=p_maximum_investor_allocation,maximum_strategy_allocation_pct=p_maximum_strategy_allocation_pct,minimum_liquidity_reserve=p_minimum_liquidity_reserve,emergency_freeze_threshold_pct=p_emergency_freeze_threshold_pct,updated_at=now() where id=p_strategy_id;select to_jsonb(s) into afterv from public.zynth_strategies s where s.id=p_strategy_id;insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'strategy.risk_controls_changed','zynth_strategy',p_strategy_id,jsonb_build_object('before',beforev,'after',afterv));return afterv;end $function$;

CREATE OR REPLACE FUNCTION public.zynth_admin_unfreeze_strategy(p_admin_id uuid, p_strategy_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 update public.zynth_strategies set status='active',risk_frozen=false,risk_freeze_reason=null,risk_frozen_at=null,updated_at=now() where id=p_strategy_id and risk_frozen=true;
 if not found then raise exception 'STRATEGY_NOT_FROZEN'; end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'strategy.risk_unfrozen','zynth_strategy',p_strategy_id,jsonb_build_object('reason',p_reason));
 return jsonb_build_object('ok',true,'strategy_id',p_strategy_id,'status','active');
end $function$;

CREATE OR REPLACE FUNCTION public.zynth_vault_statement_snapshot(p_user_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u public.users%rowtype; opening numeric:=0; closing numeric:=0; deposits numeric:=0; investments numeric:=0; returns numeric:=0; fees numeric:=0; withdrawals numeric:=0; redemptions numeric:=0; ending_nav jsonb; transaction_summary jsonb; first_day date; prior_day date; calc_return numeric; reconciliation numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'INVALID_STATEMENT_PERIOD'; end if;
 select * into u from public.users where id=p_user_id;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 first_day:=p_period_start; prior_day:=p_period_start-1;

 with holdings as (
   select ie.strategy_id,
     sum(case when ie.event_type in ('created','adjusted') then ie.units when ie.event_type='redeemed' then -ie.units else 0 end) units
   from public.zynth_investment_events ie
   where ie.user_id=p_user_id and ie.created_at::date<=prior_day
   group by ie.strategy_id
 ), navs as (
   select h.strategy_id,h.units,
     (select nh.nav from public.zynth_nav_history nh where nh.strategy_id=h.strategy_id and nh.nav_date<=prior_day order by nh.nav_date desc,nh.id desc limit 1) nav
   from holdings h
 )
 select coalesce(sum(units*nav),0) into opening from navs where units>0 and nav is not null;

 with holdings as (
   select ie.strategy_id,
     sum(case when ie.event_type in ('created','adjusted') then ie.units when ie.event_type='redeemed' then -ie.units else 0 end) units
   from public.zynth_investment_events ie
   where ie.user_id=p_user_id and ie.created_at::date<=p_period_end
   group by ie.strategy_id
 ), navs as (
   select h.strategy_id,h.units,
     (select nh.nav from public.zynth_nav_history nh where nh.strategy_id=h.strategy_id and nh.nav_date<=p_period_end order by nh.nav_date desc,nh.id desc limit 1) nav
   from holdings h
   where h.units>0
 )
 select coalesce(sum(units*nav),0) into closing from navs where nav is not null;

 select coalesce(sum(case when t.type='deposit' then t.amount else 0 end),0),
        coalesce(sum(case when t.type in ('investment','topup') then t.amount else 0 end),0),
        coalesce(sum(case when t.type='fee_deduction' then t.amount else 0 end),0),
        coalesce(sum(case when t.type in ('withdrawal','profit_withdrawal') then t.amount else 0 end),0),
        coalesce(sum(case when t.type='investment_redemption' then t.amount else 0 end),0)
 into deposits,investments,fees,withdrawals,redemptions
 from public.transactions t
 where t.user_id=p_user_id and t.status='completed' and t.created_at::date between p_period_start and p_period_end;

 select coalesce(sum(ie.amount) filter(where ie.event_type='settled'),0) into returns
 from public.zynth_investment_events ie
 where ie.user_id=p_user_id and ie.created_at::date between p_period_start and p_period_end;

 select coalesce(jsonb_agg(jsonb_build_object('strategy_id',x.strategy_id,'strategy_name',x.name,'nav',x.nav) order by x.name),'[]'::jsonb)
 into ending_nav
 from (
   select distinct on (s.id) s.id strategy_id,s.name,nh.nav
   from public.zynth_investments i join public.zynth_strategies s on s.id=i.strategy_id
   join public.zynth_nav_history nh on nh.strategy_id=s.id and nh.nav_date<=p_period_end
   where i.user_id=p_user_id
   order by s.id,nh.nav_date desc,nh.id desc
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'date',t.created_at,'type',t.type,'amount',t.amount,'status',t.status,'reference',t.reference) order by t.created_at),'[]'::jsonb)
 into transaction_summary
 from public.transactions t
 where t.user_id=p_user_id and t.created_at::date between p_period_start and p_period_end
   and t.status='completed';

 reconciliation:=closing-(opening+returns);
 return jsonb_build_object(
  'account_id',u.id,'account_email',u.email,'statement_period',jsonb_build_object('start',p_period_start,'end',p_period_end),
  'opening_balance',round(opening,2),'deposits',round(deposits,2),'investments',round(investments,2),
  'returns',round(returns,2),'fees',round(fees,2),'withdrawals',round(withdrawals,2),'redemptions',round(redemptions,2),
  'closing_value',round(closing,2),'ending_nav',ending_nav,'transaction_summary',transaction_summary,
  'vault_reconciliation_delta',round(reconciliation,2),'generated_at',now()
 );
end $function$;

CREATE OR REPLACE FUNCTION public.zynth_statement_periods(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.period_end desc,x.version desc) from (
   select id,period_type,period_start,period_end,version,status,generated_at,content_hash
   from public.zynth_vault_statements where user_id=p_user_id
 ) x),'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.zynth_statement_insert(p_user_id uuid, p_period_type text, p_period_start date, p_period_end date, p_snapshot jsonb, p_pdf_bytes bytea, p_content_hash text, p_supersedes_id uuid DEFAULT NULL::uuid, p_revision_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v integer;statement_id uuid;begin if auth.uid() is not null and auth.uid()<>p_user_id and not public.zynth_has_role(auth.uid(),'admin') then raise exception 'AUTHORIZATION_REQUIRED';end if;select coalesce(max(version),0)+1 into v from public.zynth_vault_statements where user_id=p_user_id and period_start=p_period_start and period_end=p_period_end;insert into public.zynth_vault_statements(user_id,period_type,period_start,period_end,version,status,snapshot,pdf_bytes,content_hash,supersedes_id,revision_reason) values(p_user_id,p_period_type,p_period_start,p_period_end,v,case when v=1 then 'final' else 'revised' end,p_snapshot,p_pdf_bytes,p_content_hash,p_supersedes_id,p_revision_reason) returning public.zynth_vault_statements.id into statement_id;return jsonb_build_object('id',statement_id,'version',v);end $function$;

CREATE OR REPLACE FUNCTION public.zynth_statement_get(p_statement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare x public.zynth_vault_statements%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select * into x from public.zynth_vault_statements where id=p_statement_id and user_id=auth.uid();
 if not found then raise exception 'STATEMENT_NOT_FOUND'; end if;
 return jsonb_build_object('id',x.id,'period_type',x.period_type,'period_start',x.period_start,'period_end',x.period_end,'version',x.version,'status',x.status,'snapshot',x.snapshot,'content_hash',x.content_hash,'generated_at',x.generated_at);
end $function$;

revoke all on function public.zynth_strategy_risk_evaluate(uuid,numeric,numeric,numeric) from public,anon,authenticated; grant execute on function public.zynth_strategy_risk_evaluate(uuid,numeric,numeric,numeric) to service_role;
revoke all on function public.zynth_admin_set_strategy_risk_controls(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated; grant execute on function public.zynth_admin_set_strategy_risk_controls(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;
revoke all on function public.zynth_admin_unfreeze_strategy(uuid,uuid,text) from public,anon,authenticated; grant execute on function public.zynth_admin_unfreeze_strategy(uuid,uuid,text) to authenticated;
revoke all on function public.zynth_vault_statement_snapshot(uuid,date,date) from public,anon,authenticated; grant execute on function public.zynth_vault_statement_snapshot(uuid,date,date) to authenticated,service_role;
revoke all on function public.zynth_statement_insert(uuid,text,date,date,jsonb,bytea,text,uuid,text) from public,anon,authenticated; grant execute on function public.zynth_statement_insert(uuid,text,date,date,jsonb,bytea,text,uuid,text) to service_role;
revoke all on function public.zynth_statement_get(uuid) from public,anon; grant execute on function public.zynth_statement_get(uuid) to authenticated;
revoke all on function public.zynth_statement_periods(uuid) from public,anon; grant execute on function public.zynth_statement_periods(uuid) to authenticated;
