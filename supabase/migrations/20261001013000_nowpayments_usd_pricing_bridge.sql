-- ZYNTH: move NOWPayments crypto pricing to USD with an admin-controlled NGN/USD snapshot.
-- NGN remains the investor-facing accounting currency. NOWPayments receives USD only.

alter table public.zynth_payment_provider_settings
  add column if not exists usd_ngn_rate numeric(14,4),
  add column if not exists fx_source text,
  add column if not exists fx_updated_at timestamptz;

update public.zynth_payment_provider_settings
set usd_ngn_rate = coalesce(usd_ngn_rate, 1328.8750),
    fx_source = coalesce(nullif(fx_source,''), 'Initial market reference'),
    fx_updated_at = coalesce(fx_updated_at, now()),
    price_currency = 'usd',
    updated_at = now()
where provider='nowpayments';

alter table public.zynth_payment_provider_settings
  alter column usd_ngn_rate set default 1328.8750;

alter table public.zynth_payment_provider_settings
  add constraint zynth_nowpayments_usd_ngn_rate_ck
  check (usd_ngn_rate is null or usd_ngn_rate > 0);

alter table public.zynth_crypto_payments
  add column if not exists ngn_amount numeric(14,2),
  add column if not exists usd_amount numeric(18,8),
  add column if not exists usd_ngn_rate numeric(14,4),
  add column if not exists fx_source text,
  add column if not exists fx_rate_at timestamptz;

-- Preserve the meaning of legacy records. Only newly created payments use the USD bridge.
update public.zynth_crypto_payments cp
set ngn_amount = coalesce(ngn_amount, price_amount)
where ngn_amount is null
  and lower(coalesce(price_currency,'ngn'))='ngn';

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
         api_key_ciphertext, ipn_secret_ciphertext, last_test_status,
         usd_ngn_rate, fx_source, fx_updated_at
    into s
  from public.zynth_payment_provider_settings
  where provider='nowpayments'
  limit 1;

  if not found then raise exception 'NOWPAYMENTS_NOT_CONFIGURED'; end if;

  return jsonb_build_object(
    'enabled', coalesce(s.enabled,false),
    'price_currency', 'usd',
    'fixed_rate', coalesce(s.fixed_rate,false),
    'fee_paid_by_user', coalesce(s.fee_paid_by_user,false),
    'api_key_ciphertext', s.api_key_ciphertext,
    'ipn_secret_ciphertext', s.ipn_secret_ciphertext,
    'last_test_status', s.last_test_status,
    'usd_ngn_rate', s.usd_ngn_rate,
    'fx_source', s.fx_source,
    'fx_updated_at', s.fx_updated_at
  );
end;
$function$;

revoke all on function public.get_nowpayments_runtime_config() from public;
grant execute on function public.get_nowpayments_runtime_config() to authenticated;
grant execute on function public.get_nowpayments_runtime_config() to anon;

create or replace function public.record_nowpayments_payment_v2(
  p_deposit_id uuid,
  p_pay_currency text,
  p_ngn_amount numeric,
  p_usd_amount numeric,
  p_usd_ngn_rate numeric,
  p_fx_source text,
  p_payment jsonb
)
returns public.zynth_crypto_payments
language plpgsql
security definer
set search_path = public
as $function$
declare
  d record;
  r public.zynth_crypto_payments;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_ngn_amount is null or p_ngn_amount <= 0 then raise exception 'INVALID_NGN_AMOUNT'; end if;
  if p_usd_amount is null or p_usd_amount <= 0 then raise exception 'INVALID_USD_AMOUNT'; end if;
  if p_usd_ngn_rate is null or p_usd_ngn_rate <= 0 then raise exception 'INVALID_FX_RATE'; end if;

  select id,user_id,status,total_amount into d
  from public.deposit_requests
  where id=p_deposit_id and user_id=auth.uid()
  for update;

  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
  if d.status <> 'pending' then raise exception 'DEPOSIT_NOT_PENDING'; end if;

  insert into public.zynth_crypto_payments(
    user_id,deposit_id,nowpayments_payment_id,order_id,
    price_amount,price_currency,ngn_amount,usd_amount,usd_ngn_rate,fx_source,fx_rate_at,
    pay_amount,pay_currency,pay_address,payment_status,expiration_at,provider_payload
  )
  values(
    auth.uid(),d.id,nullif(p_payment->>'payment_id',''),d.id::text,
    p_usd_amount,'usd',p_ngn_amount,p_usd_amount,p_usd_ngn_rate,
    nullif(left(trim(coalesce(p_fx_source,'')),120),''),now(),
    nullif(p_payment->>'pay_amount','')::numeric,lower(trim(p_pay_currency)),
    nullif(p_payment->>'pay_address',''),
    lower(coalesce(p_payment->>'payment_status','waiting')),
    nullif(p_payment->>'expiration_estimate_date','')::timestamptz,
    p_payment
  )
  returning * into r;

  return r;
end;
$function$;

revoke all on function public.record_nowpayments_payment_v2(uuid,text,numeric,numeric,numeric,text,jsonb) from public;
grant execute on function public.record_nowpayments_payment_v2(uuid,text,numeric,numeric,numeric,text,jsonb) to authenticated;

-- Never let future configuration writes restore NGN as the provider pricing currency.
update public.zynth_payment_provider_settings
set price_currency='usd', updated_at=now()
where provider='nowpayments';
