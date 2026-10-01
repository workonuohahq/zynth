-- ZYNTH Transaction Control Center
alter type public.transaction_type add value if not exists 'topup';
alter type public.transaction_type add value if not exists 'manual_adjustment';
alter type public.transaction_type add value if not exists 'refund';
alter type public.transaction_type add value if not exists 'reversal';
alter type public.transaction_status add value if not exists 'processing';
alter type public.transaction_status add value if not exists 'reversed';
alter type public.transaction_status add value if not exists 'cancelled';
alter table public.transactions add column if not exists currency text not null default 'NGN', add column if not exists net_amount numeric not null default 0, add column if not exists direction text not null default 'credit', add column if not exists method text, add column if not exists source text, add column if not exists provider text, add column if not exists provider_status text, add column if not exists provider_transaction_id text, add column if not exists parent_transaction_id uuid, add column if not exists reversal_of uuid, add column if not exists balance_before numeric, add column if not exists balance_after numeric, add column if not exists updated_at timestamptz not null default now();
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);
create index if not exists transactions_status_idx on public.transactions(status);
create index if not exists transactions_type_idx on public.transactions(type);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_method_idx on public.transactions(method);
create index if not exists transactions_provider_status_idx on public.transactions(provider_status);
create index if not exists transactions_provider_transaction_id_idx on public.transactions(provider_transaction_id);
create index if not exists transactions_parent_transaction_id_idx on public.transactions(parent_transaction_id);
create index if not exists transactions_reversal_of_idx on public.transactions(reversal_of);
create index if not exists transactions_reference_lower_idx on public.transactions(lower(reference));
alter table public.transactions drop constraint if exists transactions_direction_check;
alter table public.transactions add constraint transactions_direction_check check(direction in ('credit','debit'));
create or replace function public.zynth_transactions_touch_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists zynth_transactions_touch_updated_at on public.transactions;
create trigger zynth_transactions_touch_updated_at before update on public.transactions for each row execute function public.zynth_transactions_touch_updated_at();
update public.transactions t set net_amount=case when t.net_amount=0 then t.amount else t.net_amount end,currency=coalesce(nullif(t.metadata->>'currency',''),'NGN'),method=coalesce(nullif(t.metadata->>'method',''),case when t.metadata->>'source' like '%crypto%' then 'crypto' else null end),source=coalesce(nullif(t.metadata->>'source',''),'system'),direction=case when t.type::text in ('withdrawal','investment_redemption','profit_withdrawal','fee_deduction','investment','cycle_entry','reversal') then 'debit' else 'credit' end,updated_at=coalesce(t.processed_at,t.created_at) where t.net_amount=0 or t.source is null;
CREATE OR REPLACE FUNCTION public.zynth_admin_transaction_action(p_admin_id uuid, p_transaction_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t public.transactions%rowtype;
  d public.deposit_requests%rowtype;
  w public.withdrawal_requests%rowtype;
  reversal_id uuid;
  before_balance numeric;
  after_balance numeric;
  reason text:=nullif(trim(p_reason),'');
  new_direction text;
  new_type public.transaction_type;
  action_text text;
begin
  if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  select * into t from public.transactions where id=p_transaction_id for update;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;

  if p_action in ('approve','reject','return_pending') and reason is null then
    raise exception 'REASON_REQUIRED';
  end if;

  if p_action='approve' then
    if t.type::text='deposit' then
      select * into d from public.deposit_requests where id::text=t.metadata->>'deposit_request_id' for update;
      if d.id is null then raise exception 'DEPOSIT_WORKFLOW_NOT_FOUND'; end if;
      if d.status<>'pending' or t.status::text<>'pending' then raise exception 'TRANSACTION_NOT_APPROVABLE'; end if;
      perform public.zynth_admin_process_deposit_v2(auth.uid(),d.id,true,reason);
      action_text:='transaction.approved';
    elsif t.type::text='withdrawal' then
      select * into w from public.withdrawal_requests where transaction_id=t.id for update;
      if w.id is null then raise exception 'WITHDRAWAL_WORKFLOW_NOT_FOUND'; end if;
      if w.status not in ('pending','under_review','processing') then raise exception 'TRANSACTION_NOT_APPROVABLE'; end if;
      perform public.process_withdrawal_action(w.id,case when w.status='processing' then 'paid' else 'processing' end,auth.uid(),reason);
      action_text:='transaction.approved';
    else
      raise exception 'USE_SOURCE_WORKFLOW_FOR_THIS_TRANSACTION';
    end if;

  elsif p_action='reject' then
    if t.type::text='deposit' then
      select * into d from public.deposit_requests where id::text=t.metadata->>'deposit_request_id' for update;
      if d.id is null or d.status<>'pending' or t.status::text<>'pending' then raise exception 'TRANSACTION_NOT_REJECTABLE'; end if;
      perform public.zynth_admin_process_deposit_v2(auth.uid(),d.id,false,reason);
      action_text:='transaction.rejected';
    elsif t.type::text='withdrawal' then
      select * into w from public.withdrawal_requests where transaction_id=t.id for update;
      if w.id is null or w.status not in ('pending','under_review') then raise exception 'TRANSACTION_NOT_REJECTABLE'; end if;
      perform public.process_withdrawal_action(w.id,'reject',auth.uid(),reason);
      action_text:='transaction.rejected';
    else
      if t.status::text<>'pending' then raise exception 'TRANSACTION_NOT_REJECTABLE'; end if;
      update public.transactions set status='failed',failure_reason=reason,processed_at=now(),processed_by=auth.uid(),updated_at=now() where id=t.id;
      action_text:='transaction.rejected';
    end if;

  elsif p_action='return_pending' then
    if t.status::text not in ('failed','cancelled') then raise exception 'TRANSACTION_NOT_ELIGIBLE'; end if;
    if t.type::text='deposit' then
      select * into d from public.deposit_requests where id::text=t.metadata->>'deposit_request_id' for update;
      if d.id is not null and d.status in ('rejected','cancelled') then
        update public.deposit_requests set status='pending',processed_at=null,processed_by=null,admin_note=null where id=d.id;
      elsif d.id is not null then raise exception 'DEPOSIT_WORKFLOW_STATE_UNSUPPORTED'; end if;
    elsif t.type::text='withdrawal' then
      select * into w from public.withdrawal_requests where transaction_id=t.id for update;
      if w.id is not null and w.status in ('rejected','cancelled') then
        raise exception 'WITHDRAWAL_REOPEN_REQUIRES_FUNDS_REVIEW';
      end if;
    end if;
    update public.transactions set status='pending',failure_reason=null,processed_at=null,processed_by=null,updated_at=now() where id=t.id;
    action_text:='transaction.returned_pending';

  elsif p_action in ('reverse','refund') then
    if t.status::text<>'completed' then raise exception 'ONLY_COMPLETED_TRANSACTIONS_CAN_BE_REVERSED'; end if;
    if t.reversal_of is not null or exists(select 1 from public.transactions x where x.reversal_of=t.id and x.status::text<>'failed') then raise exception 'TRANSACTION_ALREADY_REVERSED'; end if;
    if coalesce(t.metadata->>'auto_invested','false')='true' or t.type::text in ('investment','investment_redemption','cycle_entry','cycle_payout','settlement_adjustment','withdrawal','profit_withdrawal') then
      raise exception 'TRANSACTION_REQUIRES_SOURCE_WORKFLOW';
    end if;
    before_balance:=(select main_wallet_balance from public.users where id=t.user_id for update);
    if t.direction='credit' then
      if before_balance < t.net_amount then raise exception 'INSUFFICIENT_USER_BALANCE_TO_REVERSE'; end if;
      after_balance:=before_balance-t.net_amount;
      new_direction:='debit';
    else
      after_balance:=before_balance+t.net_amount;
      new_direction:='credit';
    end if;
    new_type:=case when p_action='refund' then 'refund'::public.transaction_type else 'reversal'::public.transaction_type end;
    insert into public.transactions(user_id,type,amount,net_amount,currency,direction,status,reference,metadata,processed_at,processed_by,source,method,provider,provider_status,parent_transaction_id,reversal_of,balance_before,balance_after)
    values(t.user_id,new_type,t.net_amount,t.net_amount,t.currency,new_direction,'completed','ZYN-'||case when p_action='refund' then 'REF-' else 'REV-' end||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
      jsonb_build_object('source_transaction_id',t.id,'reason',reason,'admin_id',auth.uid(),'compensates',t.reference),now(),auth.uid(),'admin_override',t.method,t.provider,t.provider_status,t.id,t.id,before_balance,after_balance)
    returning id into reversal_id;
    update public.users set main_wallet_balance=after_balance,updated_at=now() where id=t.user_id;
    update public.transactions set status=case when p_action='refund' then 'reversed'::transaction_status else 'reversed'::transaction_status end,updated_at=now() where id=t.id;
    action_text:='transaction.'||p_action;
  else
    raise exception 'INVALID_TRANSACTION_ACTION';
  end if;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),action_text,'transaction',t.id,jsonb_build_object(
    'previous_status',t.status::text,'action',p_action,'reason',reason,'reference',t.reference,
    'created_compensation_transaction_id',reversal_id,'user_id',t.user_id
  ));

  return jsonb_build_object('ok',true,'action',p_action,'transaction_id',t.id,'compensation_transaction_id',reversal_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.zynth_admin_transaction_center(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_provider text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_page integer:=greatest(1,coalesce(p_page,1));
  v_size integer:=greatest(10,least(coalesce(p_page_size,25),100));
  v_offset integer;
  v_total bigint;
  v_rows jsonb;
  v_health jsonb;
  v_q text:=nullif(trim(p_search),'');
begin
  if auth.uid() is null or not public.zynth_has_role(auth.uid(),'admin') then
    raise exception 'ADMIN_AUTHORIZATION_REQUIRED';
  end if;

  v_offset:=(v_page-1)*v_size;

  with base as (
    select t.*,
      u.full_name,u.email,
      coalesce(nullif(t.method,''),case when cp.id is not null then 'crypto' else null end) as resolved_method,
      coalesce(t.provider,case when cp.id is not null then 'nowpayments' else null end) as resolved_provider,
      coalesce(t.provider_status,cp.payment_status) as resolved_provider_status,
      coalesce(t.provider_transaction_id,cp.nowpayments_payment_id,cp.transaction_hash) as resolved_provider_tx,
      coalesce(t.source,t.metadata->>'source','system') as resolved_source,
      coalesce(cp.payment_status, null) as crypto_status,
      dr.status as deposit_workflow_status,
      wr.status as withdrawal_workflow_status,
      rr.status as redemption_workflow_status,
      admin_user.full_name as processed_by_name
    from public.transactions t
    join public.users u on u.id=t.user_id
    left join public.zynth_crypto_payments cp on cp.deposit_id::text=t.metadata->>'deposit_request_id'
    left join public.deposit_requests dr on dr.id::text=t.metadata->>'deposit_request_id'
    left join public.withdrawal_requests wr on wr.transaction_id=t.id
    left join public.zynth_redemption_requests rr on rr.id::text=t.metadata->>'redemption_id'
    left join public.users admin_user on admin_user.id=t.processed_by
  ), filtered as (
    select *
    from base b
    where (p_status is null or p_status='' or b.status::text=p_status)
      and (p_type is null or p_type='' or b.type::text=p_type)
      and (p_method is null or p_method='' or lower(coalesce(b.resolved_method,''))=lower(p_method))
      and (p_currency is null or p_currency='' or upper(coalesce(b.currency,'NGN'))=upper(p_currency))
      and (p_provider is null or p_provider='' or lower(coalesce(b.resolved_provider,''))=lower(p_provider))
      and (p_source is null or p_source='' or lower(coalesce(b.resolved_source,''))=lower(p_source))
      and (p_admin_id is null or b.processed_by=p_admin_id)
      and (p_date_from is null or b.created_at>=p_date_from)
      and (p_date_to is null or b.created_at<p_date_to)
      and (p_min_amount is null or b.amount>=p_min_amount)
      and (p_max_amount is null or b.amount<=p_max_amount)
      and (
        v_q is null
        or b.id::text ilike '%'||v_q||'%'
        or coalesce(b.reference,'') ilike '%'||v_q||'%'
        or coalesce(b.full_name,'') ilike '%'||v_q||'%'
        or coalesce(b.email,'') ilike '%'||v_q||'%'
        or coalesce(b.resolved_provider_tx,'') ilike '%'||v_q||'%'
        or coalesce(b.metadata->>'payment_reference','') ilike '%'||v_q||'%'
      )
  )
  select count(*) into v_total from filtered;

  with base as (
    select t.*,
      u.full_name,u.email,
      coalesce(nullif(t.method,''),case when cp.id is not null then 'crypto' else null end) as resolved_method,
      coalesce(t.provider,case when cp.id is not null then 'nowpayments' else null end) as resolved_provider,
      coalesce(t.provider_status,cp.payment_status) as resolved_provider_status,
      coalesce(t.provider_transaction_id,cp.nowpayments_payment_id,cp.transaction_hash) as resolved_provider_tx,
      coalesce(t.source,t.metadata->>'source','system') as resolved_source,
      dr.status as deposit_workflow_status,
      wr.status as withdrawal_workflow_status,
      rr.status as redemption_workflow_status,
      admin_user.full_name as processed_by_name
    from public.transactions t
    join public.users u on u.id=t.user_id
    left join public.zynth_crypto_payments cp on cp.deposit_id::text=t.metadata->>'deposit_request_id'
    left join public.deposit_requests dr on dr.id::text=t.metadata->>'deposit_request_id'
    left join public.withdrawal_requests wr on wr.transaction_id=t.id
    left join public.zynth_redemption_requests rr on rr.id::text=t.metadata->>'redemption_id'
    left join public.users admin_user on admin_user.id=t.processed_by
  ), filtered as (
    select * from base b
    where (p_status is null or p_status='' or b.status::text=p_status)
      and (p_type is null or p_type='' or b.type::text=p_type)
      and (p_method is null or p_method='' or lower(coalesce(b.resolved_method,''))=lower(p_method))
      and (p_currency is null or p_currency='' or upper(coalesce(b.currency,'NGN'))=upper(p_currency))
      and (p_provider is null or p_provider='' or lower(coalesce(b.resolved_provider,''))=lower(p_provider))
      and (p_source is null or p_source='' or lower(coalesce(b.resolved_source,''))=lower(p_source))
      and (p_admin_id is null or b.processed_by=p_admin_id)
      and (p_date_from is null or b.created_at>=p_date_from)
      and (p_date_to is null or b.created_at<p_date_to)
      and (p_min_amount is null or b.amount>=p_min_amount)
      and (p_max_amount is null or b.amount<=p_max_amount)
      and (v_q is null or b.id::text ilike '%'||v_q||'%' or coalesce(b.reference,'') ilike '%'||v_q||'%' or coalesce(b.full_name,'') ilike '%'||v_q||'%' or coalesce(b.email,'') ilike '%'||v_q||'%' or coalesce(b.resolved_provider_tx,'') ilike '%'||v_q||'%' or coalesce(b.metadata->>'payment_reference','') ilike '%'||v_q||'%')
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rows
  from (
    select id,reference,user_id,full_name,email,type::text as type,amount,net_amount,currency,direction,
      resolved_method as method,resolved_source as source,resolved_provider as provider,
      resolved_provider_status as provider_status,resolved_provider_tx as provider_transaction_id,
      status::text as status,created_at,processed_at,processed_by,processed_by_name,
      metadata, failure_reason,
      deposit_workflow_status,withdrawal_workflow_status,redemption_workflow_status,
      (status::text='pending' and type::text='deposit' and deposit_workflow_status='pending') as can_approve,
      (status::text='pending' and type::text='deposit' and deposit_workflow_status='pending') as can_reject,
      (status::text in ('failed','cancelled') and type::text='deposit' and deposit_workflow_status in ('rejected','cancelled')) as can_return_pending,
      (status::text='completed' and direction in ('credit','debit') and type::text in ('deposit','manual_adjustment','refund','reversal','referral_reward','zpa_commission','profit_unlock','fee_deduction')) as can_reverse
    from filtered
    order by created_at desc
    offset v_offset limit v_size
  ) x;

  select jsonb_build_object(
    'today_volume',coalesce((select sum(t.amount) from public.transactions t where t.created_at>=date_trunc('day',now()) and t.status::text='completed'),0),
    'completed',coalesce((select count(*) from public.transactions t where t.status::text='completed'),0),
    'pending',coalesce((select count(*) from public.transactions t where t.status::text='pending'),0),
    'processing',coalesce((select count(*) from public.transactions t where t.status::text='processing'),0),
    'failed',coalesce((select count(*) from public.transactions t where t.status::text='failed'),0),
    'reversed',coalesce((select count(*) from public.transactions t where t.status::text='reversed'),0),
    'manual_overrides',coalesce((select count(*) from public.audit_logs a where a.target_type='transaction' and a.action like 'transaction.%'),0),
    'provider_mismatches',coalesce((select count(*) from public.transactions t where t.provider_status is not null and ((lower(t.provider_status)='finished' and t.status::text<>'completed') or (lower(t.provider_status) in ('failed','expired','refunded') and t.status::text not in ('failed','cancelled','reversed')))),0),
    'unmatched_provider_payments',coalesce((select count(*) from public.zynth_crypto_payments cp where cp.nowpayments_payment_id is not null and not exists(select 1 from public.transactions t where t.metadata->>'deposit_request_id'=cp.deposit_id::text)),0)
  ) into v_health;

  return jsonb_build_object('rows',v_rows,'total',v_total,'page',v_page,'page_size',v_size,'health',v_health);
end;
$function$


CREATE OR REPLACE FUNCTION public.zynth_admin_transaction_detail(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t public.transactions%rowtype;
  u public.users%rowtype;
  cp public.zynth_crypto_payments%rowtype;
  dr public.deposit_requests%rowtype;
  wr public.withdrawal_requests%rowtype;
  rr public.zynth_redemption_requests%rowtype;
  v_audit jsonb;
  v_timeline jsonb;
  v_children jsonb;
begin
  if auth.uid() is null or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  select * into t from public.transactions where id=p_transaction_id;
  if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
  select * into u from public.users where id=t.user_id;
  select * into cp from public.zynth_crypto_payments where deposit_id::text=t.metadata->>'deposit_request_id' limit 1;
  select * into dr from public.deposit_requests where id::text=t.metadata->>'deposit_request_id' limit 1;
  select * into wr from public.withdrawal_requests where transaction_id=t.id limit 1;
  select * into rr from public.zynth_redemption_requests where id::text=t.metadata->>'redemption_id' limit 1;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at asc),'[]'::jsonb) into v_audit
  from (
    select a.id,a.action,a.target_type,a.target_id,a.metadata,a.created_at,a.actor_user_id,au.full_name actor_name,au.email actor_email
    from public.audit_logs a left join public.users au on au.id=a.actor_user_id
    where (a.target_id=t.id and a.target_type='transaction')
       or a.target_id in (dr.id,wr.id,rr.id)
       or (a.metadata->>'reference')=t.reference
  ) a;

  select coalesce(jsonb_agg(x order by x.at asc),'[]'::jsonb) into v_timeline
  from (
    select t.created_at at,'Transaction created' event,coalesce(t.source,'system') detail from public.transactions t0 where false
    union all select t.created_at,'Transaction created',coalesce(t.source,'system')
    union all select t.processed_at,'Transaction processed',coalesce(t.status::text,'—') where t.processed_at is not null
    union all select cp.created_at,'Provider payment created','NOWPayments' where cp.id is not null
    union all select cp.last_ipn_at,'Provider callback received',coalesce(cp.payment_status,'IPN received') where cp.last_ipn_at is not null
    union all select dr.processed_at,'Deposit workflow processed',coalesce(dr.status,'—') where dr.id is not null and dr.processed_at is not null
    union all select wr.reviewed_at,'Withdrawal reviewed',coalesce(wr.status,'—') where wr.id is not null and wr.reviewed_at is not null
    union all select wr.processing_at,'Withdrawal processing',coalesce(wr.status,'—') where wr.id is not null and wr.processing_at is not null
    union all select wr.paid_at,'Withdrawal paid','External payout marked paid' where wr.id is not null and wr.paid_at is not null
    union all select rr.requested_at,'Redemption requested',coalesce(rr.status,'—') where rr.id is not null
    union all select rr.approved_at,'Redemption approved','Administrator approval' where rr.id is not null and rr.approved_at is not null
    union all select rr.processing_at,'Redemption processing','Release workflow' where rr.id is not null and rr.processing_at is not null
    union all select rr.released_at,'Redemption released','Funds released' where rr.id is not null and rr.released_at is not null
  ) x;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at asc),'[]'::jsonb) into v_children
  from (
    select id,type::text,amount,net_amount,currency,direction,status::text,reference,created_at,reversal_of,parent_transaction_id
    from public.transactions
    where parent_transaction_id=t.id or reversal_of=t.id
  ) c;

  return jsonb_build_object(
    'transaction',to_jsonb(t),
    'user',jsonb_build_object('id',u.id,'full_name',u.full_name,'email',u.email,'main_wallet_balance',u.main_wallet_balance,'locked_vault_balance',u.locked_vault_balance),
    'crypto_payment',case when cp.id is null then null else to_jsonb(cp) end,
    'deposit_request',case when dr.id is null then null else to_jsonb(dr) end,
    'withdrawal_request',case when wr.id is null then null else to_jsonb(wr) end,
    'redemption_request',case when rr.id is null then null else to_jsonb(rr) end,
    'audit',v_audit,
    'timeline',v_timeline,
    'related_transactions',v_children
  );
end;
$function$

revoke all on function public.zynth_admin_transaction_center(text,text,text,text,text,text,text,uuid,timestamptz,timestamptz,numeric,numeric,integer,integer) from public;
grant execute on function public.zynth_admin_transaction_center(text,text,text,text,text,text,text,uuid,timestamptz,timestamptz,numeric,numeric,integer,integer) to authenticated;
revoke all on function public.zynth_admin_transaction_detail(uuid) from public;
grant execute on function public.zynth_admin_transaction_detail(uuid) to authenticated;
revoke all on function public.zynth_admin_transaction_action(uuid,uuid,text,text) from public;
grant execute on function public.zynth_admin_transaction_action(uuid,uuid,text,text) to authenticated;
