-- ZYNTH trader governance: administrator-only onboarding
-- Self-application is retired. Existing application records remain as historical data.
revoke execute on function public.zynth_apply_trader(uuid,text,text,text,integer,text[],text,text,text,numeric,numeric,text,text,text) from public, anon, authenticated;
drop function if exists public.zynth_apply_trader(uuid,text,text,text,integer,text[],text,text,text,numeric,numeric,text,text,text);

revoke execute on function public.zynth_admin_review_trader_application(uuid,uuid,text,text) from public, anon, authenticated;
drop function if exists public.zynth_admin_review_trader_application(uuid,uuid,text,text);

comment on table public.zynth_trader_applications is 'Legacy trader application records retained for historical audit only. New trader access is granted exclusively by administrator onboarding.';

revoke insert, update, delete, truncate, references, trigger on table public.zynth_trader_applications from anon, authenticated;
revoke select on table public.zynth_trader_applications from anon;
