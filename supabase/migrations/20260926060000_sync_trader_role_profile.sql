-- Keep trader role/profile state synchronized for every admin role change.
create or replace function public.admin_set_user_role(p_admin_user_id uuid,p_user_id uuid,p_role text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare v_old_role text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_user_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if p_role not in ('user','trader','admin') then raise exception 'INVALID_ROLE'; end if;
 select role::text into v_old_role from public.users where id=p_user_id for update;
 if v_old_role is null then raise exception 'USER_NOT_FOUND'; end if;
 update public.users set role=p_role::user_role,updated_at=now() where id=p_user_id;
 if p_role='trader' then
   insert into public.zynth_trader_profiles(user_id,status,display_name,approved_at,approved_by,agreement_accepted_at)
   select p_user_id,'active',coalesce(full_name,email,'Trader'),now(),p_admin_user_id,now()
   from public.users where id=p_user_id
   on conflict(user_id) do update set status='active',restricted_reason=null,approved_at=coalesce(zynth_trader_profiles.approved_at,now()),approved_by=p_admin_user_id,updated_at=now();
 elsif v_old_role='trader' then
   update public.zynth_trader_profiles
   set status='restricted',restricted_reason='Trader role removed by administrator',updated_at=now()
   where user_id=p_user_id;
 end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(auth.uid(),'user.role_changed','user',p_user_id,jsonb_build_object('previous_role',v_old_role,'role',p_role));
 return jsonb_build_object('ok',true,'user_id',p_user_id,'role',p_role);
end;
$function$;