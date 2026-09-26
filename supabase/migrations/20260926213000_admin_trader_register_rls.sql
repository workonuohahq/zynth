-- Restore the admin read path used by the trader command center.
-- The authorization helper lives outside the exposed schema to avoid recursive RLS on users.

create schema if not exists private;

create or replace function private.is_active_admin()
returns boolean
language sql
security definer
stable
set search_path=''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.role = 'admin'
      and u.account_status = 'active'
  );
$$;

revoke all on function private.is_active_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

drop policy if exists users_admin_select on public.users;
create policy users_admin_select
on public.users
for select
to authenticated
using ((select private.is_active_admin()));

drop policy if exists trader_profiles_admin_select on public.zynth_trader_profiles;
create policy trader_profiles_admin_select
on public.zynth_trader_profiles
for select
to authenticated
using ((select private.is_active_admin()));

drop policy if exists trader_applications_admin_select on public.zynth_trader_applications;
create policy trader_applications_admin_select
on public.zynth_trader_applications
for select
to authenticated
using ((select private.is_active_admin()));
