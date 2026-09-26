-- Restore the admin read path used by the trader command center.
-- Admin authorization is row-scoped to the active admin session; no public read access is granted.

drop policy if exists users_admin_select on public.users;
create policy users_admin_select
on public.users
for select
to authenticated
using (
  exists (
    select 1
    from public.users admin
    where admin.id = (select auth.uid())
      and admin.role = 'admin'
      and admin.account_status = 'active'
  )
);

drop policy if exists trader_profiles_admin_select on public.zynth_trader_profiles;
create policy trader_profiles_admin_select
on public.zynth_trader_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.users admin
    where admin.id = (select auth.uid())
      and admin.role = 'admin'
      and admin.account_status = 'active'
  )
);

drop policy if exists trader_applications_admin_select on public.zynth_trader_applications;
create policy trader_applications_admin_select
on public.zynth_trader_applications
for select
to authenticated
using (
  exists (
    select 1
    from public.users admin
    where admin.id = (select auth.uid())
      and admin.role = 'admin'
      and admin.account_status = 'active'
  )
);
