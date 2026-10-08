-- Fix NOWPayments checkout: runtime config must provide the encrypted API-key ciphertext
-- required by the server route to decrypt and call NOWPayments.
-- The plaintext key is never returned by this function.
create or replace function public.get_nowpayments_runtime_config()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare s record;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select enabled, price_currency, fixed_rate, fee_paid_by_user,
         api_key_ciphertext, last_test_status, usd_ngn_rate, fx_source, fx_updated_at
    into s
  from public.zynth_payment_provider_settings
  where provider='nowpayments'
  limit 1;
  if not found then raise exception 'NOWPAYMENTS_NOT_CONFIGURED'; end if;
  return jsonb_build_object(
    'enabled',coalesce(s.enabled,false),
    'price_currency','usd',
    'fixed_rate',coalesce(s.fixed_rate,false),
    'fee_paid_by_user',coalesce(s.fee_paid_by_user,false),
    'api_key_ciphertext',s.api_key_ciphertext,
    'last_test_status',s.last_test_status,
    'usd_ngn_rate',s.usd_ngn_rate,
    'fx_source',s.fx_source,
    'fx_updated_at',s.fx_updated_at
  );
end;
$function$;