-- Phase 12: server-authoritative device revocation using the existing security domain.
create or replace function public.zynth_security_revoke_device(p_device_id uuid)
returns integer language plpgsql security definer set search_path='public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
 if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_security_devices where id=p_device_id and user_id=v_user) then raise exception 'DEVICE_NOT_FOUND'; end if;
 update public.zynth_security_sessions set revoked_at=now(),current=false,revoke_reason='device_revoked'
 where user_id=v_user and device_id=p_device_id and revoked_at is null;
 get diagnostics v_count=row_count;
 update public.zynth_security_devices set revoked_at=now() where id=p_device_id and user_id=v_user;
 insert into public.zynth_security_login_events(user_id,device_id,event_type,success,metadata)
 values(v_user,p_device_id,'session_revoked',true,jsonb_build_object('reason','device_revoked','session_count',v_count));
 return v_count;
end; $$;
revoke all on function public.zynth_security_revoke_device(uuid) from public,anon;
grant execute on function public.zynth_security_revoke_device(uuid) to authenticated,service_role;
