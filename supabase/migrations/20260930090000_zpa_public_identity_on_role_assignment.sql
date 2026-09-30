-- Ensure every admin-assigned ZPA receives a permanent public acquisition ID at role assignment time.
CREATE OR REPLACE FUNCTION public.zynth_admin_set_user_roles(p_admin_id uuid, p_user_id uuid, p_role_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare k text; v_role_id uuid; old_keys text[]; new_keys text[]; target_is_admin boolean; actor_is_admin boolean; v_zpa_code text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then
   raise exception 'ADMIN_AUTHORIZATION_REQUIRED';
 end if;
 if not exists(select 1 from public.users where id=p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
 if p_role_keys is null or coalesce(array_length(p_role_keys,1),0)=0 then raise exception 'AT_LEAST_ONE_ROLE_REQUIRED'; end if;
 select coalesce(array_agg(r.key order by r.key),'{}') into old_keys from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id where ur.user_id=p_user_id and ur.is_active;
 select coalesce(array_agg(distinct lower(trim(x)) order by lower(trim(x))),'{}') into new_keys from unnest(p_role_keys) x where lower(trim(x))<>'' and exists(select 1 from public.zynth_roles r where r.key=lower(trim(x)) and r.is_active);
 if coalesce(array_length(new_keys,1),0)<>coalesce(array_length(p_role_keys,1),0) then raise exception 'INVALID_ROLE_SELECTED'; end if;
 actor_is_admin:=public.zynth_has_role(auth.uid(),'admin'); target_is_admin:='admin'=any(new_keys);
 if p_user_id=auth.uid() and not target_is_admin then raise exception 'CANNOT_REMOVE_ADMIN_ACCESS_FROM_SELF'; end if;
 delete from public.zynth_user_roles where user_id=p_user_id;
 foreach k in array new_keys loop
   select id into v_role_id from public.zynth_roles where key=k;
   insert into public.zynth_user_roles(user_id,role_id,assigned_by,is_active) values(p_user_id,v_role_id,auth.uid(),true);
 end loop;
 update public.users set role=(case when 'admin'=any(new_keys) then 'admin'::user_role when 'trader'=any(new_keys) then 'trader'::user_role when 'zpa'=any(new_keys) then 'zpa'::user_role else 'user'::user_role end),updated_at=now() where id=p_user_id;
 if 'zpa'=any(new_keys) then
   select c.code into v_zpa_code from public.zynth_zpa_codes c where c.zpa_id=p_user_id limit 1;
   if v_zpa_code is null then
     v_zpa_code:='ZPA-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
     insert into public.zynth_zpa_codes(zpa_id,code,active) values(p_user_id,v_zpa_code,true);
   else
     update public.zynth_zpa_codes set active=true,updated_at=now() where zpa_id=p_user_id;
   end if;
 end if;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'user.roles_changed','user',p_user_id,jsonb_build_object('from',old_keys,'to',new_keys,'zpa_code',v_zpa_code));
 return jsonb_build_object('ok',true,'user_id',p_user_id,'roles',new_keys,'zpa_code',v_zpa_code);
end $function$;