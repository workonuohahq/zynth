-- ZYNTH: harden NOWPayments currency separation.
-- The provider price currency is fiat (currently NGN). It must never be exposed
-- as a selectable crypto target, even if stale catalog rows or clients exist.

create or replace function public.get_user_payment_methods()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_manual record;
  v_provider record;
  v_currencies jsonb;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_manual
  from public.get_deposit_payment_config();

  select enabled, price_currency, fixed_rate, fee_paid_by_user,
         api_key_ciphertext, ipn_secret_ciphertext, last_test_status
    into v_provider
  from public.zynth_payment_provider_settings
  where provider = 'nowpayments'
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'currency_code', lower(currency_code),
      'name', name,
      'symbol', symbol,
      'network', network
    ) order by lower(currency_code)
  ), '[]'::jsonb)
  into v_currencies
  from public.zynth_payment_currencies
  where provider = 'nowpayments'
    and provider_available = true
    and zynth_enabled = true
    and lower(currency_code) <> lower(coalesce(v_provider.price_currency, 'ngn'));

  return jsonb_build_object(
    'manual', jsonb_build_object(
      'flutterwave', coalesce(v_manual.flutterwave_enabled, false),
      'paystack', coalesce(v_manual.paystack_enabled, false)
    ),
    'crypto', jsonb_build_object(
      'enabled',
        coalesce(v_provider.enabled, false)
        and v_provider.api_key_ciphertext is not null
        and v_provider.ipn_secret_ciphertext is not null
        and v_provider.last_test_status = 'success'
        and jsonb_array_length(v_currencies) > 0,
      'currencies', v_currencies,
      'price_currency', coalesce(v_provider.price_currency, 'ngn'),
      'fixed_rate', coalesce(v_provider.fixed_rate, false),
      'fee_paid_by_user', coalesce(v_provider.fee_paid_by_user, false)
    )
  );
end;
$$;

revoke all on function public.get_user_payment_methods() from public;
revoke all on function public.get_user_payment_methods() from anon;
grant execute on function public.get_user_payment_methods() to authenticated;

-- Purge any accidental/stale NGN row from the customer-selectable catalog.
update public.zynth_payment_currencies
set zynth_enabled = false,
    updated_at = now()
where provider = 'nowpayments'
  and lower(currency_code) = 'ngn';
