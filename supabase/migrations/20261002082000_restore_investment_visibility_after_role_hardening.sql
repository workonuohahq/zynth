-- Restore investor strategy visibility after role-function privilege hardening.
-- The strategy SELECT policy must not depend on a client-inaccessible helper.
-- zynth_has_role remains callable only by authenticated users and is scoped to auth.uid().

create or replace function public.zynth_has_role(p_user_id uuid,p_role_key text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select case
    when auth.uid() is null or auth.uid() <> p_user_id then false
    else exists(
      select 1
      from public.zynth_user_roles ur
      join public.zynth_roles r on r.id=ur.role_id
      where ur.user_id=p_user_id
        and r.key=p_role_key
        and ur.is_active
        and (ur.expires_at is null or ur.expires_at>now())
    )
    or exists(
      select 1
      from public.users u
      where u.id=p_user_id
        and ((p_role_key='investor' and u.role::text='user') or u.role::text=p_role_key)
    )
  end;
$function$;

grant execute on function public.zynth_has_role(uuid,text) to authenticated;
revoke execute on function public.zynth_has_role(uuid,text) from anon;

drop policy if exists "strategies_select_trader_or_admin_or_active" on public.zynth_strategies;
drop policy if exists "zynth_strategies_select_active" on public.zynth_strategies;

create policy "strategies_select_trader_or_admin_or_active"
on public.zynth_strategies
for select
to authenticated
using (
  status='active'
  or trader_id=(select auth.uid())
  or exists (
    select 1 from public.users u
    where u.id=(select auth.uid())
      and u.role::text='admin'
      and u.account_status='active'
  )
);
