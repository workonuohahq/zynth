-- Harden the new crypto funding RPC surface.
revoke all on function public.create_crypto_deposit_request(uuid,numeric,uuid,uuid) from public;
grant execute on function public.create_crypto_deposit_request(uuid,numeric,uuid,uuid) to authenticated;
revoke all on function public.zynth_finalize_crypto_deposit_request(uuid) from public,anon,authenticated;
grant execute on function public.zynth_finalize_crypto_deposit_request(uuid) to service_role;
revoke all on function public.zynth_finalize_crypto_payment(text,text,numeric,text,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.zynth_finalize_crypto_payment(text,text,numeric,text,text,numeric,jsonb) to service_role;