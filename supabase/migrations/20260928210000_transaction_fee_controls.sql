-- ZYNTH transaction fee controls and server-side fee snapshots
-- Deposit fee is added on top of the investor's requested credited amount.
-- Existing withdrawal behaviour is preserved at 10% + ₦0 by default.

alter table public.system_settings
  add column if not exists deposit_fee_pct numeric(12,4) not null default 0,
  add column if not exists deposit_fee_fixed numeric(14,2) not null default 0,
  add column if not exists withdrawal_fee_pct numeric(12,4) not null default 10,
  add column if not exists withdrawal_fee_fixed numeric(14,2) not null default 0;

alter table public.deposit_requests
  add column if not exists fee_amount numeric(14,2) not null default 0,
  add column if not exists total_amount numeric(14,2) not null default 0,
  add column if not exists fee_pct numeric(12,4) not null default 0,
  add column if not exists fee_fixed_amount numeric(14,2) not null default 0;

update public.deposit_requests
set total_amount=coalesce(nullif(total_amount,0),amount)
where total_amount is null or total_amount=0;

alter table public.withdrawal_requests
  add column if not exists fee_fixed_amount numeric(14,2) not null default 0;

update public.withdrawal_requests
set fee_fixed_amount=round(greatest(coalesce(fee_amount,0)-(coalesce(gross_amount,0)*coalesce(fee_pct,0)/100),0),2)
where fee_fixed_amount=0 and coalesce(fee_amount,0)>0;

alter table public.system_settings
  add constraint system_settings_deposit_fee_pct_ck check (deposit_fee_pct between 0 and 100),
  add constraint system_settings_deposit_fee_fixed_ck check (deposit_fee_fixed >= 0),
  add constraint system_settings_withdrawal_fee_pct_ck check (withdrawal_fee_pct between 0 and 100),
  add constraint system_settings_withdrawal_fee_fixed_ck check (withdrawal_fee_fixed >= 0);

alter table public.deposit_requests
  add constraint deposit_requests_fee_amount_ck check (fee_amount >= 0),
  add constraint deposit_requests_total_amount_ck check (total_amount >= amount),
  add constraint deposit_requests_fee_pct_ck check (fee_pct between 0 and 100),
  add constraint deposit_requests_fee_fixed_ck check (fee_fixed_amount >= 0);

alter table public.withdrawal_requests
  add constraint withdrawal_requests_fee_fixed_ck check (fee_fixed_amount >= 0);

create or replace function public.zynth_sync_deposit_fee_transaction()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status is distinct from old.status then
    update public.transactions
    set status=case
          when new.status='confirmed' then 'completed'::public.transaction_status
          when new.status in ('rejected','cancelled') then 'failed'::public.transaction_status
          else status
        end,
        processed_at=case when new.status in ('confirmed','rejected','cancelled') then coalesce(processed_at,now()) else processed_at end,
        processed_by=case when new.status in ('confirmed','rejected','cancelled') then coalesce(processed_by,new.processed_by) else processed_by end
    where type='fee_deduction'
      and metadata->>'deposit_request_id'=new.id::text
      and status='pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zynth_sync_deposit_fee_transaction on public.deposit_requests;
create trigger trg_zynth_sync_deposit_fee_transaction
after update of status on public.deposit_requests
for each row execute function public.zynth_sync_deposit_fee_transaction();

drop function if exists public.get_withdrawal_policy();
create function public.get_withdrawal_policy()
returns table(
  exit_fee_pct numeric,
  withdrawal_fee_pct numeric,
  withdrawal_fee_fixed numeric,
  global_min_withdrawal numeric,
  withdrawals_enabled boolean,
  withdrawal_processing_notice text
)
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select s.exit_fee_pct,s.withdrawal_fee_pct,s.withdrawal_fee_fixed,
         s.global_min_withdrawal,s.withdrawals_enabled,s.withdrawal_processing_notice
  from public.system_settings s limit 1;
end;
$$;

create or replace function public.request_withdrawal(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  wallet numeric; fee_pct numeric; fee_fixed numeric; fee numeric; net numeric; min_withdrawal numeric;
  enabled boolean; state text; b public.withdrawal_beneficiaries%rowtype;
  wid uuid; tid uuid; ref text;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
  select main_wallet_balance,account_status into wallet,state from public.users where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
  select withdrawals_enabled,global_min_withdrawal,withdrawal_fee_pct,withdrawal_fee_fixed
    into enabled,min_withdrawal,fee_pct,fee_fixed
    from public.system_settings where id='00000000-0000-0000-0000-000000000001';
  if not coalesce(enabled,true) then raise exception 'WITHDRAWALS_DISABLED'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_amount<coalesce(min_withdrawal,0) then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
  if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
  if exists(select 1 from public.withdrawal_requests where user_id=p_user_id and status in ('pending','under_review','processing')) then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
  if wallet<p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;
  if p_beneficiary_id is null then raise exception 'BENEFICIARY_REQUIRED'; end if;
  select * into b from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id;
  if not found then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
  fee:=round((p_amount*coalesce(fee_pct,0)/100)+coalesce(fee_fixed,0),2);
  net:=round(p_amount-fee,2);
  if net<=0 then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
  ref:='ZYN-WD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  update public.users set main_wallet_balance=main_wallet_balance-p_amount,updated_at=now() where id=p_user_id;
  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(p_user_id,'withdrawal',net,'pending',ref,jsonb_build_object(
    'gross_amount',p_amount,'fee_amount',fee,'fee_pct',coalesce(fee_pct,0),
    'fee_fixed_amount',coalesce(fee_fixed,0),'beneficiary_id',b.id,'withdrawal_source','wallet'
  )) returning id into tid;
  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(p_user_id,'fee_deduction',fee,'pending','FEE-'||tid,jsonb_build_object(
    'withdrawal_id',tid,'fee_pct',coalesce(fee_pct,0),'fee_fixed_amount',coalesce(fee_fixed,0),'source','wallet'
  ));
  insert into public.withdrawal_requests(
    user_id,transaction_id,beneficiary_id,reference,gross_amount,fee_amount,net_amount,
    fee_pct,fee_fixed_amount,bank_name,account_number,account_name,status,withdrawal_source
  )
  values(p_user_id,tid,b.id,ref,p_amount,fee,net,coalesce(fee_pct,0),coalesce(fee_fixed,0),
    b.bank_name,b.account_number,b.account_name,'pending','wallet') returning id into wid;
  update public.transactions set metadata=coalesce(metadata,'{}')||jsonb_build_object('withdrawal_request_id',wid) where id=tid;
  return jsonb_build_object('withdrawal_id',wid,'transaction_id',tid,'reference',ref,
    'gross',p_amount,'fee',fee,'net',net,'fee_pct',coalesce(fee_pct,0),'fee_fixed',coalesce(fee_fixed,0),'status','pending');
exception when unique_violation then raise exception 'PENDING_WITHDRAWAL_EXISTS';
end;
$$;

create or replace function public.request_profit_withdrawal(p_user_id uuid,p_amount numeric,p_beneficiary_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  eligible numeric; fee_pct numeric; fee_fixed numeric; fee numeric; net numeric; minw numeric;
  enabled boolean; state text; b public.withdrawal_beneficiaries%rowtype;
  wid uuid; tid uuid; ref text; remaining numeric; lot record; take numeric;
  allocations jsonb:='[]'::jsonb; lot_ids uuid[]:='{}'; wallet numeric;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
  select main_wallet_balance,account_status into wallet,state from public.users where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  select withdrawals_enabled,global_min_withdrawal,withdrawal_fee_pct,withdrawal_fee_fixed
    into enabled,minw,fee_pct,fee_fixed from public.system_settings
    where id='00000000-0000-0000-0000-000000000001';
  if not coalesce(enabled,true) then raise exception 'WITHDRAWALS_DISABLED'; end if;
  if p_amount<coalesce(minw,0) then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
  if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
  if exists(select 1 from public.withdrawal_requests where user_id=p_user_id and status in ('pending','under_review','processing')) then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
  select * into b from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id;
  if not found then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
  perform public.zynth_refresh_profit_lot_statuses();
  select least(
    coalesce(sum(l.profit_amount-l.withdrawn_amount) filter(where l.unlock_at<=now() and l.withdrawn_amount<l.profit_amount),0),
    coalesce((select sum(greatest(i.current_value-i.principal_remaining,0))
      from public.zynth_investments i where i.user_id=p_user_id and i.status='active'),0)
  ) into eligible from public.zynth_profit_lots l where l.user_id=p_user_id;
  if p_amount>coalesce(eligible,0) then raise exception 'INSUFFICIENT_WITHDRAWABLE_PROFIT'; end if;
  fee:=round((p_amount*coalesce(fee_pct,0)/100)+coalesce(fee_fixed,0),2);
  net:=round(p_amount-fee,2);
  if net<=0 then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;
  remaining:=p_amount;
  for lot in
    select * from public.zynth_profit_lots
    where user_id=p_user_id and unlock_at<=now() and withdrawn_amount<profit_amount
    order by unlock_at,created_at for update
  loop
    exit when remaining<=0;
    take:=least(remaining,lot.profit_amount-lot.withdrawn_amount);
    update public.zynth_profit_lots
      set withdrawn_amount=withdrawn_amount+take,
          status=case when withdrawn_amount+take>=profit_amount then 'withdrawn' else 'partially_withdrawn' end
      where id=lot.id;
    allocations:=allocations||jsonb_build_array(jsonb_build_object('lot_id',lot.id,'amount',take));
    lot_ids:=array_append(lot_ids,lot.id);
    remaining:=remaining-take;
  end loop;
  if remaining>0 then raise exception 'INSUFFICIENT_WITHDRAWABLE_PROFIT'; end if;
  ref:='ZYN-PROFIT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(p_user_id,'profit_withdrawal',net,'pending',ref,jsonb_build_object(
    'gross_amount',p_amount,'fee_amount',fee,'fee_pct',coalesce(fee_pct,0),
    'fee_fixed_amount',coalesce(fee_fixed,0),'source','vault_profit','withdrawal_source','profit'
  )) returning id into tid;
  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(p_user_id,'fee_deduction',fee,'pending','FEE-'||tid,jsonb_build_object(
    'withdrawal_id',tid,'fee_pct',coalesce(fee_pct,0),'fee_fixed_amount',coalesce(fee_fixed,0),'source','vault_profit'
  ));
  insert into public.withdrawal_requests(
    user_id,transaction_id,beneficiary_id,reference,gross_amount,fee_amount,net_amount,
    fee_pct,fee_fixed_amount,bank_name,account_number,account_name,status,withdrawal_source,metadata,profit_lot_ids
  )
  values(p_user_id,tid,b.id,ref,p_amount,fee,net,coalesce(fee_pct,0),coalesce(fee_fixed,0),
    b.bank_name,b.account_number,b.account_name,'pending','profit',
    jsonb_build_object('profit_allocations',allocations),lot_ids) returning id into wid;
  update public.transactions set metadata=metadata||jsonb_build_object('withdrawal_request_id',wid) where id=tid;
  return jsonb_build_object('withdrawal_id',wid,'transaction_id',tid,'gross',p_amount,
    'fee',fee,'net',net,'fee_pct',coalesce(fee_pct,0),'fee_fixed',coalesce(fee_fixed,0),'status','pending');
exception when unique_violation then raise exception 'PENDING_WITHDRAWAL_EXISTS';
end;
$$;

create or replace function public.create_deposit_request(p_user_id uuid,p_amount numeric,p_method text default 'manual',p_payment_reference text default null,p_user_note text default null)
returns public.deposit_requests language plpgsql security definer set search_path=public,pg_temp
as $$
declare result_request public.deposit_requests; min_amount numeric; enabled boolean; fee_pct numeric; fee_fixed numeric; fee numeric; total numeric; deposit_ref text; pay_ref text; account_state text;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select account_status into account_state from public.users where id=p_user_id;
 if account_state is null then raise exception 'USER_NOT_FOUND'; end if;
 if account_state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 if exists(select 1 from public.transactions where user_id=p_user_id and type='withdrawal' and status='pending') then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
 select global_min_deposit,deposits_enabled,deposit_fee_pct,deposit_fee_fixed into min_amount,enabled,fee_pct,fee_fixed from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not enabled then raise exception 'DEPOSITS_DISABLED'; end if;
 if p_amount<min_amount then raise exception 'BELOW_MINIMUM'; end if;
 if p_method not in ('flutterwave','paystack','manual') then raise exception 'INVALID_METHOD'; end if;
 fee:=round((p_amount*coalesce(fee_pct,0)/100)+coalesce(fee_fixed,0),2); total:=round(p_amount+fee,2);
 deposit_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)); pay_ref:='ZYN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.deposit_requests(user_id,amount,method,status,reference,payment_reference,user_note,fee_amount,total_amount,fee_pct,fee_fixed_amount)
 values(p_user_id,p_amount,p_method,'pending',deposit_ref,pay_ref,nullif(trim(p_user_note),''),fee,total,coalesce(fee_pct,0),coalesce(fee_fixed,0)) returning * into result_request;
 insert into public.transactions(user_id,type,amount,status,reference,metadata)
 values(p_user_id,'deposit',p_amount,'pending',deposit_ref,jsonb_build_object('source','deposit_request','deposit_request_id',result_request.id,'method',p_method,'payment_reference',pay_ref,'deposit_fee_amount',fee,'deposit_total_amount',total));
 if fee>0 then
   insert into public.transactions(user_id,type,amount,status,reference,metadata)
   values(p_user_id,'fee_deduction',fee,'pending','FEE-DEP-'||result_request.id::text,jsonb_build_object('deposit_request_id',result_request.id,'source','deposit','fee_pct',coalesce(fee_pct,0),'fee_fixed_amount',coalesce(fee_fixed,0)));
 end if;
 return result_request;
end;
$$;

create or replace function public.create_deposit_request(p_user_id uuid,p_amount numeric,p_method text default 'manual',p_payment_reference text default null,p_user_note text default null,p_strategy_id uuid default null)
returns public.deposit_requests language plpgsql security definer set search_path=public,pg_temp
as $$
declare result_request public.deposit_requests; min_amount numeric; enabled boolean; fee_pct numeric; fee_fixed numeric; fee numeric; total numeric; deposit_ref text; pay_ref text; account_state text; s public.zynth_strategies%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 select account_status into account_state from public.users where id=p_user_id;
 if account_state is null then raise exception 'USER_NOT_FOUND'; end if;
 if account_state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 if exists(select 1 from public.transactions where user_id=p_user_id and type='withdrawal' and status='pending') then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
 select global_min_deposit,deposits_enabled,deposit_fee_pct,deposit_fee_fixed into min_amount,enabled,fee_pct,fee_fixed from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not enabled then raise exception 'DEPOSITS_DISABLED'; end if;
 if p_amount<min_amount then raise exception 'BELOW_MINIMUM'; end if;
 if p_method not in ('flutterwave','paystack','manual') then raise exception 'INVALID_METHOD'; end if;
 if p_strategy_id is not null then
   select * into s from public.zynth_strategies where id=p_strategy_id;
   if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
   if s.minimum_investment>0 and p_amount<s.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT'; end if;
   if s.maximum_investment is not null and p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
 end if;
 fee:=round((p_amount*coalesce(fee_pct,0)/100)+coalesce(fee_fixed,0),2); total:=round(p_amount+fee,2);
 deposit_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)); pay_ref:='ZYN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.deposit_requests(user_id,amount,method,status,reference,payment_reference,user_note,fee_amount,total_amount,fee_pct,fee_fixed_amount)
 values(p_user_id,p_amount,p_method,'pending',deposit_ref,pay_ref,nullif(trim(coalesce(p_user_note,'')||case when p_strategy_id is not null then ' | INVESTMENT_STRATEGY='||p_strategy_id::text else '' end,''),''),fee,total,coalesce(fee_pct,0),coalesce(fee_fixed,0)) returning * into result_request;
 insert into public.transactions(user_id,type,amount,status,reference,metadata)
 values(p_user_id,'deposit',p_amount,'pending',deposit_ref,jsonb_build_object('source','deposit_request','deposit_request_id',result_request.id,'method',p_method,'payment_reference',pay_ref,'investment_intent',p_strategy_id is not null,'strategy_id',p_strategy_id,'deposit_fee_amount',fee,'deposit_total_amount',total));
 if fee>0 then
   insert into public.transactions(user_id,type,amount,status,reference,metadata)
   values(p_user_id,'fee_deduction',fee,'pending','FEE-DEP-'||result_request.id::text,jsonb_build_object('deposit_request_id',result_request.id,'source','deposit','fee_pct',coalesce(fee_pct,0),'fee_fixed_amount',coalesce(fee_fixed,0)));
 end if;
 return result_request;
end;
$$;

create or replace function public.create_topup_deposit_request(p_user_id uuid,p_investment_id uuid,p_amount numeric,p_method text default 'manual')
returns public.deposit_requests language plpgsql security definer set search_path=public,pg_temp
as $$
declare d public.deposit_requests; inv public.zynth_investments%rowtype; s public.zynth_strategies%rowtype; st public.system_settings%rowtype; dep_ref text; pay_ref text; fee numeric; total numeric;
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
 select * into st from public.system_settings where id='00000000-0000-0000-0000-000000000001';
 if not st.deposits_enabled or not st.topup_enabled then raise exception 'TOPUPS_DISABLED'; end if;
 if p_amount<st.topup_min_amount then raise exception 'BELOW_MINIMUM_TOPUP'; end if;
 if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
 select * into inv from public.zynth_investments where id=p_investment_id and user_id=p_user_id for update;
 if not found or inv.status<>'active' then raise exception 'INVESTMENT_UNAVAILABLE'; end if;
 select * into s from public.zynth_strategies where id=inv.strategy_id;
 if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
 if s.maximum_investment is not null and inv.principal_remaining+p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
 fee:=round((p_amount*coalesce(st.deposit_fee_pct,0)/100)+coalesce(st.deposit_fee_fixed,0),2); total:=round(p_amount+fee,2);
 dep_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)); pay_ref:='ZYN-TOPUP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.deposit_requests(user_id,amount,method,status,reference,payment_reference,user_note,fee_amount,total_amount,fee_pct,fee_fixed_amount)
 values(p_user_id,p_amount,p_method,'pending',dep_ref,pay_ref,'INVESTMENT_TOPUP='||p_investment_id::text,fee,total,coalesce(st.deposit_fee_pct,0),coalesce(st.deposit_fee_fixed,0)) returning * into d;
 insert into public.transactions(user_id,type,amount,status,reference,metadata)
 values(p_user_id,'deposit',p_amount,'pending',dep_ref,jsonb_build_object('source','topup_deposit_request','topup_intent',true,'investment_id',p_investment_id,'strategy_id',inv.strategy_id,'deposit_request_id',d.id,'method',p_method,'payment_reference',pay_ref,'deposit_fee_amount',fee,'deposit_total_amount',total));
 if fee>0 then
   insert into public.transactions(user_id,type,amount,status,reference,metadata)
   values(p_user_id,'fee_deduction',fee,'pending','FEE-DEP-'||d.id::text,jsonb_build_object('deposit_request_id',d.id,'source','deposit','fee_pct',coalesce(st.deposit_fee_pct,0),'fee_fixed_amount',coalesce(st.deposit_fee_fixed,0)));
 end if;
 return d;
end;
$$;

drop function if exists public.zynth_admin_set_investment_settings(uuid,boolean,boolean,boolean,integer,numeric,numeric,boolean,boolean,numeric,boolean,text,time without time zone,boolean,boolean,text,text,text,text,boolean,text,text,text,text,text,boolean,text,text,text,text,text,text);

create or replace function public.zynth_admin_set_investment_settings(
 p_admin_id uuid,p_investment_enabled boolean,p_strategy_entry_enabled boolean,p_strategy_exit_enabled boolean,
 p_vault_profit_lock_days integer,p_min_deposit numeric,p_min_withdrawal numeric,
 p_deposit_fee_pct numeric,p_deposit_fee_fixed numeric,p_withdrawal_fee_pct numeric,p_withdrawal_fee_fixed numeric,
 p_deposits_enabled boolean,p_withdrawals_enabled boolean,p_exit_fee_pct numeric,p_settlement_enabled boolean,
 p_settlement_timezone text,p_settlement_cutoff_time time without time zone,p_legacy_settlement_check boolean,
 p_require_flat_trading_day boolean,p_deposit_page_title text,p_deposit_page_subtitle text,p_deposit_page_notice text,
 p_deposit_instructions text,p_flutterwave_enabled boolean,p_flutterwave_title text,p_flutterwave_account_name text,
 p_flutterwave_account_number text,p_flutterwave_bank_name text,p_flutterwave_extra text,p_paystack_enabled boolean,
 p_paystack_title text,p_paystack_account_name text,p_paystack_account_number text,p_paystack_bank_name text,
 p_paystack_extra text,p_withdrawal_processing_notice text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_before jsonb;v_after jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if p_vault_profit_lock_days<0 or p_vault_profit_lock_days>3650 then raise exception 'INVALID_LOCK_DAYS'; end if;
 if p_min_deposit<=0 or p_min_withdrawal<=0 then raise exception 'INVALID_MINIMUM_AMOUNT'; end if;
 if p_exit_fee_pct<0 or p_exit_fee_pct>100 then raise exception 'INVALID_EXIT_FEE'; end if;
 if p_deposit_fee_pct<0 or p_deposit_fee_pct>100 or p_withdrawal_fee_pct<0 or p_withdrawal_fee_pct>100 then raise exception 'INVALID_TRANSACTION_FEE_PCT'; end if;
 if p_deposit_fee_fixed<0 or p_withdrawal_fee_fixed<0 then raise exception 'INVALID_TRANSACTION_FEE_FIXED'; end if;
 if coalesce(length(p_settlement_timezone),0)=0 then raise exception 'INVALID_TIMEZONE'; end if;
 if coalesce(length(p_deposit_page_title),0)=0 then raise exception 'INVALID_DEPOSIT_TITLE'; end if;
 select to_jsonb(s) into v_before from public.system_settings s where id='00000000-0000-0000-0000-000000000001';
 update public.system_settings set
   investment_enabled=p_investment_enabled,strategy_entry_enabled=p_strategy_entry_enabled,strategy_exit_enabled=p_strategy_exit_enabled,
   vault_profit_lock_days=p_vault_profit_lock_days,global_min_deposit=p_min_deposit,global_min_withdrawal=p_min_withdrawal,
   deposit_fee_pct=p_deposit_fee_pct,deposit_fee_fixed=p_deposit_fee_fixed,
   withdrawal_fee_pct=p_withdrawal_fee_pct,withdrawal_fee_fixed=p_withdrawal_fee_fixed,
   deposits_enabled=p_deposits_enabled,withdrawals_enabled=p_withdrawals_enabled,exit_fee_pct=p_exit_fee_pct,
   settlement_enabled=p_settlement_enabled,settlement_timezone=p_settlement_timezone,settlement_cutoff_time=p_settlement_cutoff_time,
   require_flat_trading_day=p_require_flat_trading_day,deposit_page_title=p_deposit_page_title,deposit_page_subtitle=p_deposit_page_subtitle,
   deposit_page_notice=p_deposit_page_notice,deposit_instructions=p_deposit_instructions,flutterwave_enabled=p_flutterwave_enabled,
   flutterwave_title=p_flutterwave_title,flutterwave_account_name=p_flutterwave_account_name,flutterwave_account_number=p_flutterwave_account_number,
   flutterwave_bank_name=p_flutterwave_bank_name,flutterwave_extra=p_flutterwave_extra,paystack_enabled=p_paystack_enabled,paystack_title=p_paystack_title,
   paystack_account_name=p_paystack_account_name,paystack_account_number=p_paystack_account_number,paystack_bank_name=p_paystack_bank_name,
   paystack_extra=p_paystack_extra,withdrawal_processing_notice=p_withdrawal_processing_notice,updated_at=now()
 where id='00000000-0000-0000-0000-000000000001';
 select to_jsonb(s) into v_after from public.system_settings s where id='00000000-0000-0000-0000-000000000001';
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(auth.uid(),'system.settings_changed','system_settings','00000000-0000-0000-0000-000000000001',jsonb_build_object('before',v_before,'after',v_after));
 return v_after;
end;
$$;

update public.system_settings
set withdrawal_fee_pct=10,withdrawal_fee_fixed=0
where id='00000000-0000-0000-0000-000000000001';
