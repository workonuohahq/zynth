-- Supabase's pgcrypto digest()/encode() functions live in the extensions schema.
-- Keep the hardened SECURITY DEFINER search path while explicitly including it.
alter function public.zynth_security_register_device(text,text,text,text,text,text,text,text,text,text,text,text,text)
set search_path to public, extensions, pg_temp;

alter function public.zynth_security_register_session(text,uuid,text,text,text,text,text,text,timestamptz)
set search_path to public, extensions, pg_temp;

alter function public.zynth_security_heartbeat(text)
set search_path to public, extensions, pg_temp;
