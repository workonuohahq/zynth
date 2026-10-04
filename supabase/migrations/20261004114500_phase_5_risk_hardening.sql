-- Phase 5 risk hardening cleanup
drop function if exists public.zynth_risk_record_event(uuid,text,text,integer,text,text,text,uuid,text,jsonb);
revoke all on function public.zynth_risk_record_event(uuid,text,text,text,text,jsonb) from anon,authenticated,public;
grant execute on function public.zynth_risk_record_event(uuid,text,text,text,text,jsonb) to service_role;
revoke all on function public.zynth_risk_trigger() from anon,authenticated,public;
grant execute on function public.zynth_risk_trigger() to service_role;
alter function public.zynth_risk_classify(integer) set search_path=public,pg_temp;