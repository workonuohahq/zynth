-- Trader Operations Command Center: privileged, RLS-independent admin read model.
-- The function validates the caller against auth.uid() and the active admin role,
-- then returns the trader register, review queue and eligible users atomically.
create or replace function public.zynth_admin_trader_command_center(p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_admin_id then
    raise exception 'Administrator access required';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_admin_id
      and role = 'admin'
      and account_status = 'active'
  ) then
    raise exception 'Administrator access required';
  end if;

  select jsonb_build_object(
    'traders',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'full_name', u.full_name,
            'account_status', u.account_status,
            'role', u.role,
            'display_name', coalesce(tp.display_name, u.full_name, u.email, 'Trader'),
            'profile', case when tp.user_id is null then null else to_jsonb(tp) end,
            'strategy_count', (
              select count(*) from public.zynth_strategies s where s.trader_id = u.id
            )
          ) order by u.created_at desc
        )
        from public.users u
        left join public.zynth_trader_profiles tp on tp.user_id = u.id
        where u.role = 'trader' and u.account_status = 'active'
      ), '[]'::jsonb),
    'applications',
      coalesce((
        select jsonb_agg(
          to_jsonb(a) || jsonb_build_object(
            'email', u.email,
            'user_name', u.full_name
          ) order by a.created_at desc
        )
        from public.zynth_trader_applications a
        left join public.users u on u.id = a.user_id
        where a.status in ('pending','under_review','more_info')
      ), '[]'::jsonb),
    'users',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'full_name', u.full_name,
            'account_status', u.account_status,
            'created_at', u.created_at
          ) order by u.created_at desc
        )
        from public.users u
        where u.role = 'user' and u.account_status = 'active'
        limit 50
      ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.zynth_admin_trader_command_center(uuid) from public;
revoke all on function public.zynth_admin_trader_command_center(uuid) from anon;
grant execute on function public.zynth_admin_trader_command_center(uuid) to authenticated;
