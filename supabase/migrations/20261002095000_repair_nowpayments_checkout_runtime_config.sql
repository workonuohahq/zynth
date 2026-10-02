-- Repair NOWPayments checkout after runtime-config hardening.
-- Customer checkout must not call the admin-only runtime config function.
-- The server-authorized function exposes provider ciphertext only to callers holding
-- the internal runtime secret; the secret itself is never returned to clients.

create or replace function public.get_nowpayments_server_config()
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
  provided := case when headers_raw is null or headers_raw='' then null
                   else headers_raw::json->>'x-zynth-runtime-secret' end;

  select decrypted_secret into expected_server_secret
  from vault.decrypted_secrets
  where name='zynth_nowpayments_reconcile_secret'
  limit 1;

  if provided is null or expected_server_secret is null or provided <> expected_server_secret then
    raise exception 'UNAUTHORIZED';
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

revoke all on function public.get_nowpayments_server_config() from public, anon, authenticated;
grant execute on function public.get_nowpayments_server_config() to anon;
