-- Harden NOWPayments reconciliation and protect against missed IPN callbacks.
-- The worker secret itself is stored in Supabase Vault and is intentionally not committed.

create or replace function public.get_nowpayments_reconciliation_candidates(p_limit integer default 25)
returns table(
  id uuid,
  deposit_id uuid,
  nowpayments_payment_id text,
  order_id text,
  payment_status text,
  pay_currency text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $
declare
  headers_raw text := current_setting('request.headers', true);
  provided text;
begin
  provided := case when headers_raw is null or headers_raw='' then null
                   else headers_raw::json->>'x-zynth-runtime-secret' end;
  if provided is null or encode(digest(provided,'sha256'),'hex') <> '2d0362aa51a1c5898bb65fee31478b9267f612519d54c2a9a8ae58b309a741e1' then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  select cp.id, cp.deposit_id, cp.nowpayments_payment_id, cp.order_id,
         cp.payment_status, cp.pay_currency, cp.updated_at
  from public.zynth_crypto_payments cp
  where cp.nowpayments_payment_id is not null
    and cp.payment_status not in ('finished','failed','expired','refunded')
  order by cp.updated_at asc
  limit greatest(1, least(coalesce(p_limit,25),100));
end;
$$;

revoke all on function public.get_nowpayments_reconciliation_candidates(integer) from public;
grant execute on function public.get_nowpayments_reconciliation_candidates(integer) to anon;

-- process_nowpayments_ipn must also accept the dedicated reconciliation worker secret.
-- Keep the existing NOWPayments webhook secret hash unchanged.
create or replace function public.process_nowpayments_ipn(
  p_payment_id text,
  p_order_id text,
  p_status text,
  p_pay_currency text,
  p_actually_paid numeric,
  p_provider_fee numeric,
  p_transaction_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  headers_raw text := current_setting('request.headers', true);
  provided text;
  record_row public.zynth_crypto_payments;
  result jsonb;
  pay_amount numeric;
begin
  provided := case when headers_raw is null or headers_raw='' then null
                   else headers_raw::json->>'x-zynth-runtime-secret' end;

  if provided is null
     or (
       encode(digest(provided,'sha256'),'hex') <> 'e17f80f1bed4888a6a1dba6ac808d3016b5618f471a6b12bda50f12fb47e1746'
       and encode(digest(provided,'sha256'),'hex') <> '2d0362aa51a1c5898bb65fee31478b9267f612519d54c2a9a8ae58b309a741e1'
     ) then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into record_row
  from public.zynth_crypto_payments
  where nowpayments_payment_id=p_payment_id
  limit 1
  for update;

  if not found then raise exception 'PAYMENT_NOT_RECOGNIZED'; end if;
  if record_row.order_id<>p_order_id then raise exception 'PAYMENT_ORDER_MISMATCH'; end if;
  if p_pay_currency<>'' and lower(p_pay_currency)<>lower(record_row.pay_currency) then raise exception 'PAYMENT_CURRENCY_MISMATCH'; end if;

  pay_amount:=record_row.pay_amount;

  if p_status='finished' and pay_amount is not null
     and (p_actually_paid is null or p_actually_paid+1e-10<pay_amount) then
    update public.zynth_crypto_payments
    set payment_status='partially_paid',
        failure_reason='Final callback reported less than the required crypto amount.',
        last_ipn_at=now(),
        last_ipn_payload=p_payload,
        provider_payload=p_payload,
        updated_at=now()
    where id=record_row.id;
    return jsonb_build_object('ok',true,'status','partially_paid');
  end if;

  select to_jsonb(x) into result
  from public.zynth_finalize_crypto_payment(
    p_payment_id,
    p_status,
    p_actually_paid,
    case when p_pay_currency='' then null else p_pay_currency end,
    p_transaction_hash,
    p_provider_fee,
    p_payload
  ) x;

  return jsonb_build_object('ok',true,'result',result);
end;
$function$;

revoke all on function public.process_nowpayments_ipn(text,text,text,text,numeric,numeric,text,jsonb) from public;
grant execute on function public.process_nowpayments_ipn(text,text,text,text,numeric,numeric,text,jsonb) to anon;

-- Supabase Cron + pg_net invoke the reconciliation endpoint every minute.
-- The worker secret is read from Vault at execution time.
select cron.unschedule(jobid)
from cron.job
where jobname='zynth-nowpayments-reconcile';

select cron.schedule(
  'zynth-nowpayments-reconcile',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://zynth-lywd.onrender.com/api/payments/nowpayments/reconcile',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-zynth-reconcile-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='zynth_nowpayments_reconcile_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);


-- Allow server-to-server NOWPayments routes to read provider configuration without
-- requiring a customer auth session. The dedicated worker secret remains in Vault.
create or replace function public.get_nowpayments_runtime_config()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  s record;
  headers_raw text := current_setting('request.headers', true);
  provided text;
  expected_server_secret text;
begin
  if auth.uid() is null then
    provided := case when headers_raw is null or headers_raw='' then null
                     else headers_raw::json->>'x-zynth-runtime-secret' end;
    select decrypted_secret into expected_server_secret
    from vault.decrypted_secrets
    where name='zynth_nowpayments_reconcile_secret'
    limit 1;
    if provided is null or expected_server_secret is null or provided <> expected_server_secret then
      raise exception 'AUTHENTICATION_REQUIRED';
    end if;
  end if;

  select enabled, price_currency, fixed_rate, fee_paid_by_user,
         api_key_ciphertext, ipn_secret_ciphertext, last_test_status
    into s
  from public.zynth_payment_provider_settings
  where provider = 'nowpayments'
  limit 1;

  if not found then raise exception 'NOWPAYMENTS_NOT_CONFIGURED'; end if;

  return jsonb_build_object(
    'enabled', coalesce(s.enabled,false),
    'price_currency', coalesce(s.price_currency,'ngn'),
    'fixed_rate', coalesce(s.fixed_rate,false),
    'fee_paid_by_user', coalesce(s.fee_paid_by_user,false),
    'api_key_ciphertext', s.api_key_ciphertext,
    'ipn_secret_ciphertext', s.ipn_secret_ciphertext,
    'last_test_status', s.last_test_status
  );
end;
$function$;

revoke all on function public.get_nowpayments_runtime_config() from public;
grant execute on function public.get_nowpayments_runtime_config() to authenticated;
grant execute on function public.get_nowpayments_runtime_config() to anon;
