create or replace function public.zynth_admin_list_strategies(p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=p_admin_id and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'status',s.status,'nav',s.nav,'starting_balance',s.starting_balance,'current_reported_balance',s.current_reported_balance,'minimum_investment',s.minimum_investment,'maximum_investment',s.maximum_investment,'trader_id',s.trader_id,'trader_name',coalesce(tp.display_name,u.full_name,u.email,'Unassigned'),'trader_email',u.email,'created_at',s.created_at,'updated_at',s.updated_at) order by s.created_at desc) from public.zynth_strategies s left join public.users u on u.id=s.trader_id left join public.zynth_trader_profiles tp on tp.user_id=s.trader_id),'[]'::jsonb);
end $$;
revoke execute on function public.zynth_admin_list_strategies(uuid) from public,anon;
grant execute on function public.zynth_admin_list_strategies(uuid) to authenticated;

create or replace function public.zynth_public_strategies()
returns jsonb language sql security definer set search_path='public','pg_temp' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'nav',s.nav,'minimum_investment',s.minimum_investment,'maximum_investment',s.maximum_investment,'status',s.status,'trader_id',s.trader_id,'trader_name',coalesce(tp.display_name,u.full_name,'Trader')) order by s.created_at desc),'[]'::jsonb)
 from public.zynth_strategies s left join public.users u on u.id=s.trader_id left join public.zynth_trader_profiles tp on tp.user_id=s.trader_id where s.status='active';
$$;
revoke execute on function public.zynth_public_strategies() from public,anon;
grant execute on function public.zynth_public_strategies() to authenticated;