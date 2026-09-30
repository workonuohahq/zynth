-- ZYNTH: crypto checkout without a Supabase server key in Render.
-- The app server uses the authenticated Supabase client; privileged writes stay
-- inside narrowly scoped SECURITY DEFINER functions.

create or replace function public.get_nowpayments_runtime_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select enabled, price_currency, fixed_rate, fee_paid_by_user,
         api_key_ciphertext, ipn_secret_ciphertext, last_test_status
    into s
  from public.zynth_payment_provider_settings
  where provider='nowpayments'
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
$$;

revoke all on function public.get_nowpayments_runtime_config() from public, anon;
grant execute on function public.get_nowpayments_runtime_config() to authenticated;

create or replace function public.record_nowpayments_payment(
  p_deposit_id uuid,p_pay_currency text,p_price_amount numeric,p_price_currency text,p_payment jsonb
)
returns public.zynth_crypto_payments
language plpgsql
security definer
set search_path = public
as $$
declare d record; r public.zynth_crypto_payments;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select id,user_id,status into d
  from public.deposit_requests
  where id=p_deposit_id and user_id=auth.uid()
  for update;

  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
  if d.status <> 'pending' then raise exception 'DEPOSIT_NOT_PENDING'; end if;

  insert into public.zynth_crypto_payments(
    user_id,deposit_id,nowpayments_payment_id,order_id,
    price_amount,price_currency,pay_amount,pay_currency,pay_address,
    payment_status,expiration_at,provider_payload
  ) values(
    auth.uid(),d.id,nullif(p_payment->>'payment_id',''),d.id::text,
    p_price_amount,lower(coalesce(p_price_currency,'ngn')),
    nullif(p_payment->>'pay_amount','')::numeric,lower(trim(p_pay_currency)),
    nullif(p_payment->>'pay_address',''),
    lower(coalesce(p_payment->>'payment_status','waiting')),
    nullif(p_payment->>'expiration_estimate_date','')::timestamptz,p_payment
  )
  returning * into r;

  return r;
end;
$$;

revoke all on function public.record_nowpayments_payment(uuid,text,numeric,text,jsonb) from public, anon;
grant execute on function public.record_nowpayments_payment(uuid,text,numeric,text,jsonb) to authenticated;

create or replace function public.fail_nowpayments_checkout(p_deposit_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  update public.deposit_requests
  set status='rejected',
      admin_note=left(coalesce(p_reason,'Crypto checkout could not be created.'),500),
      processed_at=now()
  where id=p_deposit_id and user_id=auth.uid() and status='pending';

  update public.transactions
  set status='failed',
      failure_reason='Crypto checkout could not be created.',
      processed_at=now()
  where user_id=auth.uid()
    and status='pending'
    and (
      reference in (select reference from public.deposit_requests where id=p_deposit_id)
      or reference='FEE-DEP-'||p_deposit_id::text
    );
end;
$$;

revoke all on function public.fail_nowpayments_checkout(uuid,text) from public, anon;
grant execute on function public.fail_nowpayments_checkout(uuid,text) to authenticated;

drop policy if exists "authenticated_read_payment_currencies" on public.zynth_payment_currencies;
create policy "authenticated_read_payment_currencies"
on public.zynth_payment_currencies
for select to authenticated
using (provider='nowpayments' and zynth_enabled=true);
