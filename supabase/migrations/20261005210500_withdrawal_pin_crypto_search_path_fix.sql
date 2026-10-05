-- Withdrawal PIN RPCs use pgcrypto (crypt/gen_salt).
-- Keep the hardened search_path while explicitly exposing the extension schema.
alter function public.zynth_change_withdrawal_pin(text, text)
  set search_path to public, extensions, pg_temp;

alter function public.zynth_set_withdrawal_pin(text)
  set search_path to public, extensions, pg_temp;

alter function public.zynth_withdrawal_pin_check(text)
  set search_path to public, extensions, pg_temp;

alter function public.zynth_withdrawal_pin_status()
  set search_path to public, extensions, pg_temp;
