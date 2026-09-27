-- Normalize role aggregation so a multi-role account returns each active role exactly once.
-- This keeps middleware/API authorization deterministic without changing the role model.

create or replace function public.zynth_get_my_roles(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
select coalesce(array_agg(x.key order by x.sort_order, x.key),'{}'::text[])
from (
  select key, min(sort_order) sort_order
  from (
    select distinct r.key, r.sort_order
    from public.zynth_user_roles ur
    join public.zynth_roles r on r.id=ur.role_id
    where ur.user_id=p_user_id
      and ur.is_active
      and r.is_active
      and (ur.expires_at is null or ur.expires_at>now())
      and auth.uid()=p_user_id
    union all
    select case when u.role::text='user' then 'investor' else u.role::text end, 999
    from public.users u
    where u.id=p_user_id and auth.uid()=p_user_id
  ) roles
  group by key
) x;

revoke execute on function public.zynth_get_my_roles(uuid) from public;
grant execute on function public.zynth_get_my_roles(uuid) to authenticated;
