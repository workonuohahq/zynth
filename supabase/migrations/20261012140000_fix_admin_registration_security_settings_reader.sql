-- Reliable, role-checked reader for registration security settings.
create or replace function public.zynth_admin_get_registration_human_check(p_admin_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_settings public.zynth_registration_security%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_admin_user_id or not public.zynth_has_role(auth.uid(),'admin') then
    raise exception 'ADMIN_AUTHORIZATION_REQUIRED';
  end if;
  select * into v_settings from public.zynth_registration_security where id=true;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'human_check_enabled',v_settings.human_check_enabled,
    'updated_at',v_settings.updated_at,
    'updated_by',v_settings.updated_by
  );
end $$;
revoke all on function public.zynth_admin_get_registration_human_check(uuid) from public,anon;
grant execute on function public.zynth_admin_get_registration_human_check(uuid) to authenticated;
