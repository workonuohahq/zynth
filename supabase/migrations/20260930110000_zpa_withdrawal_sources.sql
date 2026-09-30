-- ZYNTH ZPA withdrawal-source integration.
-- Keeps ZPA earnings separate from main wallet cash while reusing the existing
-- withdrawal request, beneficiary, fee, review, processing and payout pipeline.

alter table public.zynth_zpa_earnings
  add column if not exists withdrawn_amount numeric not null default 0;

alter table public.zynth_zpa_earnings
  drop constraint if exists zynth_zpa_earnings_withdrawn_amount_nonnegative;

alter table public.zynth_zpa_earnings
  add constraint zynth_zpa_earnings_withdrawn_amount_nonnegative
  check (withdrawn_amount >= 0 and withdrawn_amount <= amount);

create index if not exists zynth_zpa_earnings_available_user_idx
  on public.zynth_zpa_earnings(zpa_id, status, created_at);

create or replace function public.zynth_withdrawable_balances(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet numeric := 0;
  profit numeric := 0;
  zpa numeric := 0;
  has_zpa boolean := false;
  state text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'AUTHORIZATION_REQUIRED';
  end if;

  select u.main_wallet_balance, u.account_status
    into wallet, state
  from public.users u
  where u.id = p_user_id
  for update;

  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if state in ('restricted','suspended','deactivated') then
    raise exception 'ACCOUNT_RESTRICTED';
  end if;

  perform public.zynth_refresh_profit_lot_statuses();

  select least(
    coalesce(sum(l.profit_amount-l.withdrawn_amount)
      filter (where l.unlock_at <= now() and l.withdrawn_amount < l.profit_amount),0),
    coalesce((
      select sum(greatest(i.current_value-i.principal_remaining,0))
      from public.zynth_investments i
      where i.user_id=p_user_id and i.status='active'
    ),0)
  )
  into profit
  from public.zynth_profit_lots l
  where l.user_id=p_user_id;

  has_zpa := public.zynth_has_role(p_user_id,'zpa');

  if has_zpa then
    select coalesce(sum(greatest(e.amount-e.withdrawn_amount,0))
      filter (where e.status='available' and e.withdrawn_amount < e.amount),0)
      into zpa
    from public.zynth_zpa_earnings e
    where e.zpa_id=p_user_id;
  end if;

  return jsonb_build_object(
    'has_zpa',has_zpa,
    'vault_profit',coalesce(profit,0),
    'available_cash',coalesce(wallet,0),
    'zpa_earnings',coalesce(zpa,0),
    'total_withdrawable',coalesce(profit,0)+coalesce(wallet,0)+coalesce(zpa,0)
  );
end;
$$;

revoke execute on function public.zynth_withdrawable_balances(uuid) from public, anon;
grant execute on function public.zynth_withdrawable_balances(uuid) to authenticated;

create or replace function public.restore_zpa_withdrawal_allocations(p_withdrawal_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  w public.withdrawal_requests%rowtype;
  x jsonb;
  amt numeric;
  eid uuid;
begin
  select * into w
  from public.withdrawal_requests
  where id=p_withdrawal_id
  for update;

  if not found or w.withdrawal_source not in ('zpa','combined') then return; end if;
  if w.metadata ? 'zpa_allocations_restored_at' then return; end if;

  for x in
    select * from jsonb_array_elements(coalesce(w.metadata->'zpa_allocations','[]'::jsonb))
  loop
    eid := (x->>'earning_id')::uuid;
    amt := greatest(0,coalesce((x->>'amount')::numeric,0));

    update public.zynth_zpa_earnings
    set withdrawn_amount=greatest(0,withdrawn_amount-amt),
        status=case
          when status='withdrawn' and greatest(0,withdrawn_amount-amt) < amount then 'available'
          else status
        end,
        updated_at=now()
    where id=eid and zpa_id=w.user_id;
  end loop;

  update public.withdrawal_requests
  set metadata=metadata||jsonb_build_object('zpa_allocations_restored_at',now())
  where id=w.id;
end;
$$;

revoke execute on function public.restore_zpa_withdrawal_allocations(uuid) from public, anon, authenticated;

create or replace function public.restore_profit_withdrawal_allocations(p_withdrawal_id uuid)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare w public.withdrawal_requests%rowtype;x jsonb;amt numeric;lid uuid;
begin
 select * into w from public.withdrawal_requests where id=p_withdrawal_id for update;
 if not found or w.withdrawal_source not in ('profit','combined') then return; end if;
 if w.metadata ? 'profit_allocations_restored_at' then return; end if;
 for x in select * from jsonb_array_elements(coalesce(w.metadata->'profit_allocations','[]'::jsonb)) loop
  lid:=(x->>'lot_id')::uuid;
  amt:=greatest(0,coalesce((x->>'amount')::numeric,0));
  update public.zynth_profit_lots
  set withdrawn_amount=greatest(0,withdrawn_amount-amt),
      status=case
        when greatest(0,withdrawn_amount-amt)>=profit_amount then 'withdrawn'
        when greatest(0,withdrawn_amount-amt)>0 then 'partially_withdrawn'
        when unlock_at<=now() then 'available' else 'locked' end
  where id=lid and user_id=w.user_id;
 end loop;
 update public.withdrawal_requests
 set metadata=metadata||jsonb_build_object('profit_allocations_restored_at',now())
 where id=w.id;
end $$;

create or replace function public.request_withdrawal_by_source(
  p_user_id uuid,
  p_amount numeric,
  p_beneficiary_id uuid,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  wallet numeric := 0;
  profit numeric := 0;
  zpa numeric := 0;
  total numeric := 0;
  remaining numeric;
  cash_take numeric := 0;
  fee_pct numeric := 0;
  fee_fixed numeric := 0;
  fee numeric := 0;
  net numeric := 0;
  min_withdrawal numeric := 0;
  enabled boolean := true;
  state text;
  has_zpa boolean := false;
  source text := lower(trim(coalesce(p_source,'')));
  b public.withdrawal_beneficiaries%rowtype;
  wid uuid;
  tid uuid;
  ref text;
  lot record;
  earning record;
  take numeric;
  profit_allocations jsonb := '[]'::jsonb;
  zpa_allocations jsonb := '[]'::jsonb;
  lot_ids uuid[] := '{}'::uuid[];
  selected_source text;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then
    raise exception 'AUTHORIZATION_REQUIRED';
  end if;

  if source not in ('cash','profit','zpa','all') then
    raise exception 'INVALID_WITHDRAWAL_SOURCE';
  end if;

  select u.main_wallet_balance,u.account_status
    into wallet,state
  from public.users u
  where u.id=p_user_id
  for update;

  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;

  select s.withdrawals_enabled,s.global_min_withdrawal,s.withdrawal_fee_pct,s.withdrawal_fee_fixed
    into enabled,min_withdrawal,fee_pct,fee_fixed
  from public.system_settings s
  where s.id='00000000-0000-0000-0000-000000000001';

  if not coalesce(enabled,true) then raise exception 'WITHDRAWALS_DISABLED'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_amount<coalesce(min_withdrawal,0) then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;

  if exists(select 1 from public.deposit_requests d where d.user_id=p_user_id and d.status='pending') then
    raise exception 'PENDING_DEPOSIT_EXISTS';
  end if;
  if exists(select 1 from public.withdrawal_requests w where w.user_id=p_user_id and w.status in ('pending','under_review','processing')) then
    raise exception 'PENDING_WITHDRAWAL_EXISTS';
  end if;

  if p_beneficiary_id is null then raise exception 'BENEFICIARY_REQUIRED'; end if;
  select * into b from public.withdrawal_beneficiaries
  where id=p_beneficiary_id and user_id=p_user_id;
  if not found then raise exception 'BENEFICIARY_NOT_FOUND'; end if;

  perform public.zynth_refresh_profit_lot_statuses();

  select least(
    coalesce(sum(l.profit_amount-l.withdrawn_amount)
      filter (where l.unlock_at<=now() and l.withdrawn_amount<l.profit_amount),0),
    coalesce((
      select sum(greatest(i.current_value-i.principal_remaining,0))
      from public.zynth_investments i
      where i.user_id=p_user_id and i.status='active'
    ),0)
  )
  into profit
  from public.zynth_profit_lots l
  where l.user_id=p_user_id;

  has_zpa := public.zynth_has_role(p_user_id,'zpa');
  if has_zpa then
    select coalesce(sum(greatest(e.amount-e.withdrawn_amount,0))
      filter (where e.status='available' and e.withdrawn_amount<e.amount),0)
      into zpa
    from public.zynth_zpa_earnings e
    where e.zpa_id=p_user_id;
  end if;

  if source='zpa' and not has_zpa then raise exception 'ZPA_ACCESS_REQUIRED'; end if;

  if source='cash' then
    if p_amount>wallet then raise exception 'INSUFFICIENT_BALANCE'; end if;
    cash_take:=p_amount;
    selected_source:='wallet';
  elsif source='profit' then
    if p_amount>coalesce(profit,0) then raise exception 'INSUFFICIENT_WITHDRAWABLE_PROFIT'; end if;
    selected_source:='profit';
  elsif source='zpa' then
    if p_amount>coalesce(zpa,0) then raise exception 'INSUFFICIENT_ZPA_EARNINGS'; end if;
    selected_source:='zpa';
  else
    total:=coalesce(wallet,0)+coalesce(profit,0)+coalesce(zpa,0);
    if p_amount>total then raise exception 'INSUFFICIENT_TOTAL_WITHDRAWABLE'; end if;
    selected_source:='combined';
    remaining:=p_amount;
    cash_take:=least(remaining,coalesce(wallet,0));
    remaining:=remaining-cash_take;

    if remaining>0 then
      for lot in
        select * from public.zynth_profit_lots
        where user_id=p_user_id and unlock_at<=now() and withdrawn_amount<profit_amount
        order by unlock_at,created_at
        for update
      loop
        exit when remaining<=0;
        take:=least(remaining,lot.profit_amount-lot.withdrawn_amount);
        update public.zynth_profit_lots
        set withdrawn_amount=withdrawn_amount+take,
            status=case when withdrawn_amount+take>=profit_amount then 'withdrawn' else 'partially_withdrawn' end
        where id=lot.id;
        profit_allocations:=profit_allocations||jsonb_build_array(jsonb_build_object('lot_id',lot.id,'amount',take));
        lot_ids:=array_append(lot_ids,lot.id);
        remaining:=remaining-take;
      end loop;
    end if;

    if remaining>0 then
      if not has_zpa then
        raise exception 'INSUFFICIENT_TOTAL_WITHDRAWABLE';
      end if;
      for earning in
        select * from public.zynth_zpa_earnings
        where zpa_id=p_user_id and status='available' and withdrawn_amount<amount
        order by created_at
        for update
      loop
        exit when remaining<=0;
        take:=least(remaining,earning.amount-earning.withdrawn_amount);
        update public.zynth_zpa_earnings
        set withdrawn_amount=withdrawn_amount+take,
            status=case when withdrawn_amount+take>=amount then 'withdrawn' else 'available' end,
            updated_at=now()
        where id=earning.id;
        zpa_allocations:=zpa_allocations||jsonb_build_array(jsonb_build_object('earning_id',earning.id,'amount',take));
        remaining:=remaining-take;
      end loop;
    end if;

    if remaining>0 then raise exception 'INSUFFICIENT_TOTAL_WITHDRAWABLE'; end if;
  end if;

  if source='profit' then
    remaining:=p_amount;
    for lot in
      select * from public.zynth_profit_lots
      where user_id=p_user_id and unlock_at<=now() and withdrawn_amount<profit_amount
      order by unlock_at,created_at
      for update
    loop
      exit when remaining<=0;
      take:=least(remaining,lot.profit_amount-lot.withdrawn_amount);
      update public.zynth_profit_lots
      set withdrawn_amount=withdrawn_amount+take,
          status=case when withdrawn_amount+take>=profit_amount then 'withdrawn' else 'partially_withdrawn' end
      where id=lot.id;
      profit_allocations:=profit_allocations||jsonb_build_array(jsonb_build_object('lot_id',lot.id,'amount',take));
      lot_ids:=array_append(lot_ids,lot.id);
      remaining:=remaining-take;
    end loop;
    if remaining>0 then raise exception 'INSUFFICIENT_WITHDRAWABLE_PROFIT'; end if;
  elsif source='zpa' then
    remaining:=p_amount;
    for earning in
      select * from public.zynth_zpa_earnings
      where zpa_id=p_user_id and status='available' and withdrawn_amount<amount
      order by created_at
      for update
    loop
      exit when remaining<=0;
      take:=least(remaining,earning.amount-earning.withdrawn_amount);
      update public.zynth_zpa_earnings
      set withdrawn_amount=withdrawn_amount+take,
          status=case when withdrawn_amount+take>=amount then 'withdrawn' else 'available' end,
          updated_at=now()
      where id=earning.id;
      zpa_allocations:=zpa_allocations||jsonb_build_array(jsonb_build_object('earning_id',earning.id,'amount',take));
      remaining:=remaining-take;
    end loop;
    if remaining>0 then raise exception 'INSUFFICIENT_ZPA_EARNINGS'; end if;
    selected_source:='zpa';
  elsif source='cash' then
    selected_source:='wallet';
  end if;

  if cash_take>0 then
    update public.users
    set main_wallet_balance=main_wallet_balance-cash_take,updated_at=now()
    where id=p_user_id and main_wallet_balance>=cash_take;
    if not found then raise exception 'INSUFFICIENT_BALANCE'; end if;
  end if;

  fee:=round((p_amount*coalesce(fee_pct,0)/100)+coalesce(fee_fixed,0),2);
  net:=round(p_amount-fee,2);
  if net<=0 then raise exception 'WITHDRAWAL_TOO_SMALL'; end if;

  ref:='ZYN-WD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(
    p_user_id,'withdrawal',net,'pending',ref,
    jsonb_build_object(
      'gross_amount',p_amount,'fee_amount',fee,'fee_pct',coalesce(fee_pct,0),
      'fee_fixed_amount',coalesce(fee_fixed,0),'beneficiary_id',b.id,
      'withdrawal_source',selected_source,
      'source_selection',source,
      'cash_amount',cash_take,
      'profit_allocations',profit_allocations,
      'zpa_allocations',zpa_allocations
    )
  ) returning id into tid;

  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(
    p_user_id,'fee_deduction',fee,'pending','FEE-'||tid,
    jsonb_build_object('withdrawal_id',tid,'fee_pct',coalesce(fee_pct,0),
      'fee_fixed_amount',coalesce(fee_fixed,0),'source',selected_source)
  );

  insert into public.withdrawal_requests(
    user_id,transaction_id,beneficiary_id,reference,gross_amount,fee_amount,net_amount,
    fee_pct,fee_fixed_amount,bank_name,account_number,account_name,status,
    withdrawal_source,metadata,profit_lot_ids
  )
  values(
    p_user_id,tid,b.id,ref,p_amount,fee,net,coalesce(fee_pct,0),coalesce(fee_fixed,0),
    b.bank_name,b.account_number,b.account_name,'pending',selected_source,
    jsonb_build_object(
      'source_selection',source,'cash_amount',cash_take,
      'profit_allocations',profit_allocations,'zpa_allocations',zpa_allocations
    ),
    lot_ids
  ) returning id into wid;

  update public.transactions
  set metadata=coalesce(metadata,'{}')||jsonb_build_object('withdrawal_request_id',wid)
  where id=tid;

  return jsonb_build_object(
    'withdrawal_id',wid,'transaction_id',tid,'reference',ref,'gross',p_amount,
    'fee',fee,'net',net,'status','pending','source',selected_source,
    'source_selection',source
  );
exception
  when unique_violation then raise exception 'PENDING_WITHDRAWAL_EXISTS';
end;
$$;

revoke execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text) from public,anon;
grant execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text) to authenticated;

create or replace function public.process_withdrawal_action(
  p_withdrawal_id uuid,p_action text,p_admin_user_id uuid,p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  w public.withdrawal_requests%rowtype;
  t public.transactions%rowtype;
  gross numeric;
  new_status text;
  reason text;
begin
  if auth.uid() is null or auth.uid()<>p_admin_user_id
     or (not public.zynth_has_role(auth.uid(),'admin')
         or not exists(select 1 from public.users where id=auth.uid() and account_status='active'))
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;

  select * into w from public.withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  select * into t from public.transactions where id=w.transaction_id for update;
  if not found then raise exception 'WITHDRAWAL_TRANSACTION_NOT_FOUND'; end if;

  gross:=w.gross_amount;
  reason:=coalesce(nullif(trim(p_reason),''),'Withdrawal rejected');

  if p_action='review' and w.status='pending' then
    update public.withdrawal_requests set status='under_review',reviewed_at=now(),reviewed_by=auth.uid() where id=w.id;
    new_status:='under_review';

  elsif p_action='processing' and w.status in ('pending','under_review') then
    update public.withdrawal_requests set status='processing',processing_at=now(),processed_by=auth.uid() where id=w.id;
    new_status:='processing';

  elsif p_action='paid' and w.status='processing' then
    update public.withdrawal_requests set status='paid',paid_at=now(),processed_by=auth.uid() where id=w.id;
    update public.transactions set status='completed',processed_at=now(),processed_by=auth.uid() where id=t.id;
    update public.transactions set status='completed',processed_at=now(),processed_by=auth.uid()
      where metadata->>'withdrawal_id'=t.id::text and type='fee_deduction' and status='pending';
    new_status:='paid';

  elsif p_action='reject' and w.status in ('pending','under_review') then
    if w.withdrawal_source='wallet' then
      update public.users set main_wallet_balance=main_wallet_balance+gross,updated_at=now() where id=w.user_id;
    elsif w.withdrawal_source='profit' then
      perform public.restore_profit_withdrawal_allocations(w.id);
    elsif w.withdrawal_source='zpa' then
      perform public.restore_zpa_withdrawal_allocations(w.id);
    elsif w.withdrawal_source='combined' then
      update public.users
      set main_wallet_balance=main_wallet_balance+coalesce((w.metadata->>'cash_amount')::numeric,0),updated_at=now()
      where id=w.user_id;
      perform public.restore_profit_withdrawal_allocations(w.id);
      perform public.restore_zpa_withdrawal_allocations(w.id);
    else
      raise exception 'UNKNOWN_WITHDRAWAL_SOURCE';
    end if;

    update public.withdrawal_requests
    set status='rejected',failure_reason=reason,
        reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,auth.uid()),
        processed_by=auth.uid()
    where id=w.id;

    update public.transactions
    set status='failed',processed_at=now(),processed_by=auth.uid(),failure_reason=reason
    where id=t.id;

    update public.transactions
    set status='failed',processed_at=now(),processed_by=auth.uid(),failure_reason=reason
    where metadata->>'withdrawal_id'=t.id::text and type='fee_deduction' and status='pending';

    new_status:='rejected';
  else
    raise exception 'INVALID_WITHDRAWAL_TRANSITION';
  end if;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(
    auth.uid(),'withdrawal.'||p_action,'withdrawal_request',w.id,
    jsonb_build_object('reference',w.reference,'source',w.withdrawal_source,
      'source_selection',w.metadata->>'source_selection',
      'from_status',w.status,'to_status',new_status,'reason',p_reason)
  );

  return jsonb_build_object('ok',true,'withdrawal_id',w.id,'status',new_status);
end;
$$;

create or replace function public.cancel_withdrawal_request(
  p_user_id uuid,p_withdrawal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  w public.withdrawal_requests%rowtype;
  t public.transactions%rowtype;
  gross numeric;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
  select * into w from public.withdrawal_requests
  where id=p_withdrawal_id and user_id=p_user_id for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if w.status<>'pending' then raise exception 'WITHDRAWAL_NOT_PENDING'; end if;
  select * into t from public.transactions where id=w.transaction_id for update;
  gross:=w.gross_amount;

  if w.withdrawal_source='wallet' then
    update public.users set main_wallet_balance=main_wallet_balance+gross,updated_at=now() where id=p_user_id;
  elsif w.withdrawal_source='profit' then
    perform public.restore_profit_withdrawal_allocations(w.id);
  elsif w.withdrawal_source='zpa' then
    perform public.restore_zpa_withdrawal_allocations(w.id);
  elsif w.withdrawal_source='combined' then
    update public.users
    set main_wallet_balance=main_wallet_balance+coalesce((w.metadata->>'cash_amount')::numeric,0),updated_at=now()
    where id=p_user_id;
    perform public.restore_profit_withdrawal_allocations(w.id);
    perform public.restore_zpa_withdrawal_allocations(w.id);
  else
    raise exception 'UNKNOWN_WITHDRAWAL_SOURCE';
  end if;

  update public.withdrawal_requests
  set status='cancelled',cancelled_at=now(),failure_reason='Cancelled by user'
  where id=w.id;

  update public.transactions
  set status='failed',failure_reason='Cancelled by user',processed_at=now()
  where id=t.id;

  update public.transactions
  set status='failed',failure_reason='Cancelled by user',processed_at=now()
  where metadata->>'withdrawal_id'=t.id::text and type='fee_deduction' and status='pending';

  return jsonb_build_object('ok',true,'status','cancelled','withdrawal_id',w.id,'refunded',gross);
end;
$$;

-- Keep internal restoration helpers unreachable directly through the Data API.
revoke execute on function public.restore_profit_withdrawal_allocations(uuid) from public,anon,authenticated;
revoke execute on function public.restore_zpa_withdrawal_allocations(uuid) from public,anon,authenticated;
