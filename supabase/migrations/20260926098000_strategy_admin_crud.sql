-- Admin strategy CRUD hardening: controlled delete for strategies with no financial/audit history.
create or replace function public.zynth_admin_delete_strategy(p_admin_id uuid,p_strategy_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare s public.zynth_strategies%rowtype;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not exists(select 1 from public.users where id=auth.uid() and role='admin' and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 select * into s from public.zynth_strategies where id=p_strategy_id for update;
 if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
 if exists(select 1 from public.zynth_investments where strategy_id=p_strategy_id)
 or exists(select 1 from public.zynth_daily_reports where strategy_id=p_strategy_id)
 or exists(select 1 from public.zynth_settlements where strategy_id=p_strategy_id)
 or exists(select 1 from public.zynth_profit_lots where strategy_id=p_strategy_id)
 or exists(select 1 from public.zynth_nav_history where strategy_id=p_strategy_id)
 then raise exception 'STRATEGY_HAS_HISTORY_USE_ARCHIVE'; end if;
 delete from public.zynth_strategies where id=p_strategy_id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(p_admin_id,'strategy.deleted','zynth_strategy',p_strategy_id,jsonb_build_object('name',s.name));
 return jsonb_build_object('success',true,'strategy_id',p_strategy_id,'status','deleted');
end $$;
revoke execute on function public.zynth_admin_delete_strategy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zynth_admin_delete_strategy(uuid,uuid) to authenticated;
