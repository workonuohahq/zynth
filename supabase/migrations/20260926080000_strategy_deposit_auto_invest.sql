-- Strategy-linked deposits are settled directly into an active investment.
-- The deposit remains auditable as a payment transaction, while confirmation
-- atomically creates the strategy position instead of leaving cash idle.

create or replace function public.create_deposit_request(
  p_user_id uuid,
  p_amount numeric,
  p_method text default 'manual',
  p_payment_reference text default null,
  p_user_note text default null,
  p_strategy_id uuid default null
)
returns public.deposit_requests
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  result_request public.deposit_requests;
  min_amount numeric;
  enabled boolean;
  deposit_ref text;
  pay_ref text;
  account_state text;
  s public.zynth_strategies%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
  select account_status into account_state from public.users where id=p_user_id;
  if account_state is null then raise exception 'USER_NOT_FOUND'; end if;
  if account_state in ('restricted','suspended','deactivated') then raise exception 'ACCOUNT_RESTRICTED'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  if exists(select 1 from public.deposit_requests where user_id=p_user_id and status='pending') then raise exception 'PENDING_DEPOSIT_EXISTS'; end if;
  if exists(select 1 from public.transactions where user_id=p_user_id and type='withdrawal' and status='pending') then raise exception 'PENDING_WITHDRAWAL_EXISTS'; end if;
  select global_min_deposit,deposits_enabled into min_amount,enabled
  from public.system_settings where id='00000000-0000-0000-0000-000000000001';
  if not enabled then raise exception 'DEPOSITS_DISABLED'; end if;
  if p_amount<min_amount then raise exception 'BELOW_MINIMUM'; end if;
  if p_method not in ('flutterwave','paystack','manual') then raise exception 'INVALID_METHOD'; end if;

  if p_strategy_id is not null then
    select * into s from public.zynth_strategies where id=p_strategy_id;
    if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
    if s.minimum_investment>0 and p_amount<s.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT'; end if;
    if s.maximum_investment is not null and p_amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;
  end if;

  deposit_ref:='DEP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  pay_ref:='ZYN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.deposit_requests(user_id,amount,method,status,reference,payment_reference,user_note)
  values(
    p_user_id,p_amount,p_method,'pending',deposit_ref,pay_ref,
    nullif(trim(coalesce(p_user_note,'')||
      case when p_strategy_id is not null then ' | INVESTMENT_STRATEGY='||p_strategy_id::text else '' end),'')
  )
  returning * into result_request;

  insert into public.transactions(user_id,type,amount,status,reference,metadata)
  values(
    p_user_id,'deposit',p_amount,'pending',deposit_ref,
    jsonb_build_object(
      'source','deposit_request',
      'deposit_request_id',result_request.id,
      'method',p_method,
      'payment_reference',pay_ref,
      'investment_intent',p_strategy_id is not null,
      'strategy_id',p_strategy_id
    )
  );

  return result_request;
end;
$$;

create or replace function public.admin_process_deposit(
  p_admin_user_id uuid,
  p_deposit_id uuid,
  p_approved boolean,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  d public.deposit_requests;
  tx public.transactions;
  credit_result jsonb;
  strategy_id uuid;
  s public.zynth_strategies%rowtype;
  inv uuid;
  units numeric;
begin
  if auth.uid() is null
     or auth.uid()<>p_admin_user_id
     or not exists(select 1 from public.users where id=auth.uid() and role='admin')
  then raise exception 'admin authorization required'; end if;

  select * into d from public.deposit_requests where id=p_deposit_id for update;
  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
  if d.status<>'pending' then raise exception 'DEPOSIT_ALREADY_PROCESSED'; end if;

  if p_approved then
    select * into tx
    from public.transactions
    where reference=d.reference and status='pending'
    for update;
    if tx.id is null then raise exception 'DEPOSIT_TRANSACTION_NOT_FOUND'; end if;

    strategy_id:=nullif(tx.metadata->>'strategy_id','')::uuid;

    if strategy_id is not null then
      select * into s from public.zynth_strategies where id=strategy_id for update;
      if not found or s.status<>'active' then raise exception 'STRATEGY_UNAVAILABLE'; end if;
      if s.minimum_investment>0 and d.amount<s.minimum_investment then raise exception 'BELOW_MINIMUM_INVESTMENT'; end if;
      if s.maximum_investment is not null and d.amount>s.maximum_investment then raise exception 'ABOVE_MAXIMUM_INVESTMENT'; end if;

      units:=d.amount/nullif(s.nav,0);
      if units is null or units<=0 then raise exception 'INVALID_STRATEGY_NAV'; end if;

      -- Credit and immediately consume the credited cash into the strategy.
      -- Both operations occur inside this database transaction, so a failure
      -- rolls the whole settlement back.
      update public.users
      set main_wallet_balance=main_wallet_balance+d.amount,updated_at=now()
      where id=d.user_id;

      update public.transactions
      set status='completed',
          processed_at=now(),
          metadata=coalesce(metadata,'{}')||
            jsonb_build_object('verified_at',now(),'source','deposit_confirmation','auto_invested',true)
      where id=tx.id;

      insert into public.zynth_investments(
        user_id,strategy_id,principal,principal_remaining,units,entry_nav,current_value,status
      )
      values(d.user_id,strategy_id,d.amount,d.amount,units,s.nav,d.amount,'active')
      returning id into inv;

      update public.zynth_strategies
      set total_units=total_units+units,updated_at=now()
      where id=s.id;

      insert into public.zynth_investment_events(
        investment_id,user_id,strategy_id,event_type,amount,units,nav
      )
      values(inv,d.user_id,strategy_id,'created',d.amount,units,s.nav);

      insert into public.transactions(user_id,type,amount,status,reference,metadata)
      values(
        d.user_id,'investment',d.amount,'completed',
        'ZYN-INV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
        jsonb_build_object(
          'strategy_id',strategy_id,
          'investment_id',inv,
          'nav',s.nav,
          'source','deposit_auto_invest',
          'deposit_request_id',d.id
        )
      );

      update public.deposit_requests
      set status='confirmed',
          admin_note=nullif(trim(p_admin_note),''),
          processed_at=now(),
          processed_by=auth.uid()
      where id=d.id;

      insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      values(
        auth.uid(),'deposit.confirmed.auto_invested','deposit_request',d.id,
        jsonb_build_object(
          'amount',d.amount,'user_id',d.user_id,'reference',d.reference,
          'strategy_id',strategy_id,'investment_id',inv,'nav',s.nav,'units',units
        )
      );

      insert into public.notifications(user_id,title,body,type,metadata)
      values(
        d.user_id,
        'Investment activated',
        'Your deposit of ₦'||to_char(d.amount,'FM999G999G999G990D00')||
          ' has been confirmed and invested in '||s.name||
          ' at NAV ₦'||to_char(s.nav,'FM999G999G999G990D00')||
          '. Your position is now active.',
        'investment',
        jsonb_build_object(
          'investment_id',inv,'strategy_id',strategy_id,
          'amount',d.amount,'nav',s.nav,'units',units,'deposit_request_id',d.id
        )
      );

      return jsonb_build_object(
        'ok',true,'status','confirmed','auto_invested',true,
        'investment_id',inv,'strategy_id',strategy_id,'nav',s.nav,'units',units
      );
    else
      credit_result:=public.credit_deposit(d.user_id,d.amount,d.reference);

      update public.deposit_requests
      set status='confirmed',
          admin_note=nullif(trim(p_admin_note),''),
          processed_at=now(),
          processed_by=auth.uid()
      where id=d.id;

      insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      values(
        auth.uid(),'deposit.confirmed','deposit_request',d.id,
        jsonb_build_object('amount',d.amount,'user_id',d.user_id,'reference',d.reference)
      );

      return jsonb_build_object('ok',true,'status','confirmed','credit',credit_result,'auto_invested',false);
    end if;
  else
    update public.deposit_requests
    set status='rejected',
        admin_note=coalesce(nullif(trim(p_admin_note),''),'Payment request rejected'),
        processed_at=now(),
        processed_by=auth.uid()
    where id=d.id;

    update public.transactions
    set status='failed',
        metadata=coalesce(metadata,'{}')||
          jsonb_build_object(
            'rejected_at',now(),
            'rejection_reason',coalesce(nullif(trim(p_admin_note),''),'Payment request rejected')
          )
    where reference=d.reference and status='pending';

    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
    values(
      auth.uid(),'deposit.rejected','deposit_request',d.id,
      jsonb_build_object('amount',d.amount,'user_id',d.user_id,'reference',d.reference,'reason',p_admin_note)
    );

    return jsonb_build_object('ok',true,'status','rejected');
  end if;
end;
$$;
