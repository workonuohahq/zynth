-- ZYNTH: unify investment funding across bank/manual and NOWPayments crypto.
-- Adds crypto as a first-class deposit method, supports strategy entry and top-ups,
-- and keeps the existing NGN ledger as the source of truth.

alter table public.deposit_requests
  drop constraint if exists deposit_requests_method_check;

alter table public.deposit_requests
  add constraint deposit_requests_method_check
  check (method = any (array['flutterwave'::text,'paystack'::text,'manual'::text,'crypto'::text]));

drop function if exists public.create_crypto_deposit_request(uuid,numeric,uuid);

create or replace function public.create_crypto_deposit_request(
  p_user_id uuid,
  p_amount numeric,
  p_strategy_id uuid default null,
  p_investment_id uuid default null
)
returns public.deposit_requests
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  d public.deposit_requests;
  st public.system_settings%rowtype;
  inv public.zynth_investments%rowtype;
  strat public.zynth_strategies%rowtype;
  fee numeric;
  total numeric;
  dep_ref text;
  pay_ref text;
  account_state text;
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
  if p_amount < st.global_min_deposit then raise exception 'BELOW_MINIMUM'; end if;

  if p_strategy_id is not null then
    select * into strat from public.zynth_strategies where id=p_strategy_id for update;
    if not found or strat.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
    if strat.minimum_investment>0 and p_amount<strat.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT'; end if;
    if strat.maximum_investment is not null and p_amount>strat.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
  else
    select * into inv from public.zynth_investments where id=p_investment_id and user_id=p_user_id for update;
    if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
    if exists(select 1 from public.zynth_redemption_requests r where r.investment_id=inv.id and r.status in ('pending','approved','processing')) then raise exception 'REDEMPTION_PENDING'; end if;
    select * into strat from public.zynth_strategies where id=inv.strategy_id for update;
    if not found or strat.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
    if not st.topup_enabled then raise exception 'TOPUPS_DISABLED'; end if;
    if p_amount < st.topup_min_amount then raise exception 'BELOW_MINIMUM_TOPUP'; end if;
    if strat.maximum_investment is not null and inv.principal_remaining+p_amount>strat.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
  end if;

  fee:=round((p_amount*coalesce(st.deposit_fee_pct,0)/100)+coalesce(st.deposit_fee_fixed,0),2);
  total:=round(p_amount+fee,2);
  dep_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  pay_ref:='ZYN-CRYPTO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.deposit_requests(
    user_id,amount,method,status,reference,payment_reference,user_note,
    fee_amount,total_amount,fee_pct,fee_fixed_amount
  ) values (
    p_user_id,p_amount,'crypto','pending',dep_ref,pay_ref,
    case when p_strategy_id is not null
      then 'CRYPTO_INVESTMENT_STRATEGY='||p_strategy_id::text
      else 'CRYPTO_INVESTMENT_TOPUP='||p_investment_id::text end,
    fee,total,coalesce(st.deposit_fee_pct,0),coalesce(st.deposit_fee_fixed,0)
  ) returning * into d;

  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(
    p_user_id,'deposit',p_amount,'pending',dep_ref,
    jsonb_build_object(
      'source','crypto_deposit_request',
      'deposit_request_id',d.id,
      'method','crypto',
      'payment_reference',pay_ref,
      'investment_intent',true,
      'strategy_id',coalesce(p_strategy_id,inv.strategy_id),
      'investment_id',p_investment_id,
      'funding_intent',case when p_strategy_id is not null then 'new_investment' else 'investment_topup' end,
      'deposit_fee_amount',fee,
      'deposit_total_amount',total
    )
  );

  if fee>0 then
    insert into public.transactions(user_id,type,amount,status,reference,metadata)
    values(
      p_user_id,'fee_deduction',fee,'pending','FEE-DEP-'||d.id::text,
      jsonb_build_object('deposit_request_id',d.id,'source','deposit','fee_pct',coalesce(st.deposit_fee_pct,0),'fee_fixed_amount',coalesce(st.deposit_fee_fixed,0))
    );
  end if;

  return d;
end;
$$;

create or replace function public.zynth_finalize_crypto_deposit_request(p_deposit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  d public.deposit_requests;
  tx public.transactions;
  s public.zynth_strategies%rowtype;
  inv public.zynth_investments%rowtype;
  investment_id uuid;
  strategy_id uuid;
  units numeric;
  inv_units_before numeric;
  inv_principal_before numeric;
  result jsonb;
  new_units numeric;
begin
  if current_user <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;

  select * into d from public.deposit_requests where id=p_deposit_id for update;
  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
  if d.status='confirmed' then return jsonb_build_object('ok',true,'already_confirmed',true); end if;
  if d.status<>'pending' then raise exception 'DEPOSIT_NOT_ELIGIBLE'; end if;

  select * into tx from public.transactions where reference=d.reference and status='pending' for update;
  if tx.id is null then raise exception 'DEPOSIT_TRANSACTION_NOT_FOUND'; end if;

  strategy_id:=nullif(tx.metadata->>'strategy_id','')::uuid;
  investment_id:=nullif(tx.metadata->>'investment_id','')::uuid;

  if investment_id is not null then
    select * into inv from public.zynth_investments where id=investment_id and user_id=d.user_id for update;
    if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
    if exists(select 1 from public.zynth_redemption_requests r where r.investment_id=inv.id and r.status in ('pending','approved','processing')) then raise exception 'REDEMPTION_PENDING'; end if;
    select * into s from public.zynth_strategies where id=inv.strategy_id for update;
    if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
    if s.maximum_investment is not null and inv.principal_remaining+d.amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
    units:=d.amount/nullif(s.nav,0);
    if units is null or units<=0 then raise exception 'INVALID_STRATEGY_NAV'; end if;

    inv_units_before:=inv.units;
    inv_principal_before:=inv.principal;
    update public.transactions set status='completed',processed_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('verified_at',now(),'source','crypto_topup_confirmation') where id=tx.id;
    update public.transactions set status='completed',processed_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('verified_at',now(),'source','crypto_topup_fee_confirmation') where reference='FEE-DEP-'||d.id::text and status='pending';

    new_units:=inv.units+units;
    update public.zynth_investments
      set principal=principal+d.amount,
          principal_remaining=principal_remaining+d.amount,
          units=new_units,
          entry_nav=(principal+d.amount)/nullif(new_units,0),
          current_value=current_value+d.amount,
          updated_at=now()
    where id=inv.id;

    update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
    insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav,metadata)
    values(inv.id,d.user_id,inv.strategy_id,'adjusted',d.amount,units,s.nav,
      jsonb_build_object('action','crypto_topup','previous_units',inv_units_before,'previous_principal',inv_principal_before,'deposit_request_id',d.id));

    insert into public.transactions(user_id,type,amount,status,reference,metadata)
    values(d.user_id,'investment',d.amount,'completed','ZYN-TOP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      jsonb_build_object('source','crypto_investment_topup','investment_id',inv.id,'strategy_id',inv.strategy_id,'nav',s.nav,'units',units,'deposit_request_id',d.id));

    update public.deposit_requests set status='confirmed',admin_note='Automatically confirmed by verified NOWPayments payment.',processed_at=now() where id=d.id;
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    values(null,'investment.topup.crypto_confirmed','zynth_investment',inv.id,
      jsonb_build_object('deposit_request_id',d.id,'amount',d.amount,'units',units,'nav',s.nav));

    insert into public.notifications(user_id,title,body,type,metadata)
    values(d.user_id,'Investment topped up','Your crypto top-up of ₦'||to_char(d.amount,'FM999G999G999G990D00')||' has been added to your '||s.name||' position at NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||'.','investment',
      jsonb_build_object('investment_id',inv.id,'strategy_id',inv.strategy_id,'amount',d.amount,'units_added',units,'nav',s.nav,'deposit_request_id',d.id,'funding_method','crypto'));

    return jsonb_build_object('ok',true,'already_confirmed',false,'auto_invested',false,'topup',true,'investment_id',inv.id,'strategy_id',inv.strategy_id,'units_added',units,'nav',s.nav);
  end if;

  if strategy_id is null then raise exception 'STRATEGY_REQUIRED'; end if;
  select * into s from public.zynth_strategies where id=strategy_id for update;
  if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
  if s.minimum_investment>0 and d.amount<s.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT'; end if;
  if s.maximum_investment is not null and d.amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
  units:=d.amount/nullif(s.nav,0);
  if units is null or units<=0 then raise exception 'INVALID_STRATEGY_NAV'; end if;

  update public.transactions set status='completed',processed_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('verified_at',now(),'source','crypto_deposit_confirmation','auto_invested',true) where id=tx.id;
  update public.transactions set status='completed',processed_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('verified_at',now(),'source','crypto_deposit_fee_confirmation') where reference='FEE-DEP-'||d.id::text and status='pending';

  insert into public.zynth_investments(user_id,strategy_id,principal,principal_remaining,units,entry_nav,current_value,status)
  values(d.user_id,s.id,d.amount,d.amount,units,s.nav,d.amount,'active') returning id into investment_id;
  update public.zynth_strategies set total_units=total_units+units,updated_at=now() where id=s.id;
  insert into public.zynth_investment_events(investment_id,user_id,strategy_id,event_type,amount,units,nav)
  values(investment_id,d.user_id,s.id,'created',d.amount,units,s.nav);
  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(d.user_id,'investment',d.amount,'completed','ZYN-INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    jsonb_build_object('strategy_id',s.id,'investment_id',investment_id,'nav',s.nav,'units',units,'source','crypto_deposit_auto_invest','deposit_request_id',d.id));

  update public.deposit_requests set status='confirmed',admin_note='Automatically confirmed by verified NOWPayments payment.',processed_at=now() where id=d.id;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(null,'deposit.confirmed.crypto_auto_invested','deposit_request',d.id,
    jsonb_build_object('amount',d.amount,'user_id',d.user_id,'reference',d.reference,'strategy_id',s.id,'investment_id',investment_id,'nav',s.nav,'units',units));
  insert into public.notifications(user_id,title,body,type,metadata)
  values(d.user_id,'Crypto deposit confirmed','Your crypto deposit of ₦'||to_char(d.amount,'FM999G999G999G990D00')||' has been confirmed and invested in '||s.name||' at NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||'. Your position is now active.','investment',
    jsonb_build_object('investment_id',investment_id,'strategy_id',s.id,'amount',d.amount,'nav',s.nav,'units',units,'deposit_request_id',d.id,'funding_method','crypto'));

  return jsonb_build_object('ok',true,'already_confirmed',false,'auto_invested',true,'topup',false,'investment_id',investment_id,'strategy_id',s.id,'units',units,'nav',s.nav);
end;
$$;

-- Keep the existing finalizer idempotent, but allow both new-investment and top-up intents.
create or replace function public.zynth_finalize_crypto_payment(
  p_nowpayments_payment_id text,
  p_status text,
  p_actually_paid numeric default null,
  p_actually_paid_currency text default null,
  p_transaction_hash text default null,
  p_provider_fee numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  cp public.zynth_crypto_payments;
  d public.deposit_requests;
  result jsonb;
begin
  if current_user <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into cp from public.zynth_crypto_payments where nowpayments_payment_id=p_nowpayments_payment_id for update;
  if not found then raise exception 'CRYPTO_PAYMENT_NOT_FOUND'; end if;

  update public.zynth_crypto_payments
    set payment_status=p_status,actually_paid=coalesce(p_actually_paid,actually_paid),
        actually_paid_currency=coalesce(p_actually_paid_currency,actually_paid_currency),
        transaction_hash=coalesce(p_transaction_hash,transaction_hash),
        provider_fee=coalesce(p_provider_fee,provider_fee),
        last_ipn_at=now(),last_ipn_payload=p_payload,provider_payload=p_payload,updated_at=now()
  where id=cp.id;

  if p_status in ('failed','expired','refunded') then
    update public.deposit_requests set status='rejected',admin_note='Crypto payment '||p_status||'.',processed_at=now() where id=cp.deposit_id and status='pending';
    update public.transactions set status='failed',failure_reason='Crypto payment '||p_status||'.',processed_at=now()
      where reference=(select reference from public.deposit_requests where id=cp.deposit_id) and status='pending';
    update public.transactions set status='failed',failure_reason='Crypto payment '||p_status||'.',processed_at=now()
      where reference='FEE-DEP-'||cp.deposit_id::text and status='pending';
    update public.zynth_crypto_payments set failure_reason='Crypto payment '||p_status||'.',updated_at=now() where id=cp.id;
    return jsonb_build_object('ok',true,'credited',false,'terminal',true,'status',p_status);
  end if;

  if p_status='finished' then
    select * into d from public.deposit_requests where id=cp.deposit_id for update;
    if d.status='confirmed' then
      update public.zynth_crypto_payments set credited_at=coalesce(credited_at,now()),updated_at=now() where id=cp.id;
      return jsonb_build_object('ok',true,'credited',true,'already_credited',true);
    end if;
    result:=public.zynth_finalize_crypto_deposit_request(cp.deposit_id);
    update public.zynth_crypto_payments set credited_at=now(),payment_status='finished',updated_at=now() where id=cp.id;
    return result||jsonb_build_object('credited',true);
  end if;

  return jsonb_build_object('ok',true,'credited',false,'terminal',false,'status',p_status);
end;
$$;

-- Ensure provider configuration is not exposed to customer roles.
alter table public.zynth_payment_provider_settings enable row level security;
revoke all on table public.zynth_payment_provider_settings from anon,authenticated;
grant all on table public.zynth_payment_provider_settings to service_role;

-- Ensure crypto payment records are only visible to their owner through the Data API.
alter table public.zynth_crypto_payments enable row level security;
revoke all on table public.zynth_crypto_payments from anon,authenticated;
grant select on table public.zynth_crypto_payments to authenticated;
drop policy if exists "zynth crypto payments own rows" on public.zynth_crypto_payments;
create policy "zynth crypto payments own rows" on public.zynth_crypto_payments
for select to authenticated
using ((select auth.uid())=user_id);

grant execute on function public.create_crypto_deposit_request(uuid,numeric,uuid,uuid) to authenticated;
grant execute on function public.zynth_finalize_crypto_deposit_request(uuid) to service_role;
grant execute on function public.zynth_finalize_crypto_payment(text,text,numeric,text,text,numeric,jsonb) to service_role;
