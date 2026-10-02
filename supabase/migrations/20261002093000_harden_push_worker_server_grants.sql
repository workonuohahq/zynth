-- Keep push delivery RPCs server-only.
-- The Vercel worker uses a privileged server key; client roles must never execute these functions.

revoke all on function public.zynth_get_push_delivery_context(uuid,text) from public, anon, authenticated;
grant execute on function public.zynth_get_push_delivery_context(uuid,text) to service_role;

revoke all on function public.zynth_revoke_push_subscription(uuid,text) from public, anon, authenticated;
grant execute on function public.zynth_revoke_push_subscription(uuid,text) to service_role;

revoke all on function public.zynth_record_broadcast_push_result(uuid,text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.zynth_record_broadcast_push_result(uuid,text,integer,integer,integer) to service_role;

alter function public.zynth_get_push_delivery_context(uuid,text) set search_path = public;
alter function public.zynth_revoke_push_subscription(uuid,text) set search_path = public;
alter function public.zynth_record_broadcast_push_result(uuid,text,integer,integer,integer) set search_path = '';