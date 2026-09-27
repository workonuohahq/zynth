-- Multi-role compatibility for existing trader onboarding and strategy authorization.

create or replace function public.zynth_admin_promote_trader(p_user_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_role text;
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'Administrator access required'; end if;
 select role::text into v_role from public.users where id=p_user_id for update;
 if v_role is null then raise exception 'User not found'; end if;
 insert into public.zynth_user_roles(user_id,role_id,assigned_by,is_active)
 select p_user_id,r.id,p_admin_id,true from public.zynth_roles r where r.key='trader'
 on conflict(user_id,role_id) do update set is_active=true,assigned_by=p_admin_id,assigned_at=now();
 update public.users set role=case when role='admin' then role else 'trader'::user_role end,updated_at=now() where id=p_user_id;
 insert into public.zynth_trader_profiles(user_id,status,display_name,approved_at,approved_by,agreement_accepted_at)
 select p_user_id,'active',coalesce(full_name,email,'Trader'),now(),p_admin_id,now() from public.users where id=p_user_id
 on conflict(user_id) do update set status='active',approved_at=now(),approved_by=p_admin_id,updated_at=now();
 update public.zynth_trader_applications set status='approved',reviewed_by=p_admin_id,reviewed_at=now(),updated_at=now() where user_id=p_user_id and status in ('pending','under_review','more_info');
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'user.role_added','user',p_user_id,jsonb_build_object('role','trader','source','admin_trader_onboarding'));
 return jsonb_build_object('success',true,'user_id',p_user_id,'status','active','role_added','trader');
end $$;

create or replace function public.zynth_trader_create_strategy(p_trader_id uuid,p_name text,p_description text,p_starting_balance numeric,p_minimum numeric,p_maximum numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_id uuid;
begin
 if auth.uid() is null or auth.uid()<>p_trader_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 if not exists(select 1 from public.users where id=p_trader_id and (role='trader' or public.zynth_has_role(id,'trader')) and account_status='active') then raise exception 'TRADER_ACCESS_REQUIRED'; end if;
 if not exists(select 1 from public.zynth_trader_profiles where user_id=p_trader_id and status='active') then raise exception 'TRADER_PROFILE_NOT_ACTIVE'; end if;
 if coalesce(length(btrim(p_name)),0)<2 then raise exception 'STRATEGY_NAME_REQUIRED'; end if;
 if p_starting_balance is null or p_starting_balance<=0 then raise exception 'STARTING_BALANCE_MUST_BE_POSITIVE'; end if;
 if p_minimum is null or p_minimum<=0 then raise exception 'MINIMUM_INVESTMENT_MUST_BE_POSITIVE'; end if;
 if p_maximum is not null and p_maximum<p_minimum then raise exception 'MAXIMUM_BELOW_MINIMUM'; end if;
 insert into public.zynth_strategies(name,description,trader_id,starting_balance,current_reported_balance,starting_nav,nav,total_units,high_water_mark,minimum_investment,maximum_investment,status)
 values(left(btrim(p_name),120),left(coalesce(p_description,''),2000),p_trader_id,p_starting_balance,p_starting_balance,1000,1000,0,1000,p_minimum,p_maximum,'pending_review') returning id into v_id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(p_trader_id,'strategy.proposed','zynth_strategy',v_id,jsonb_build_object('name',left(btrim(p_name),120),'status','pending_review'));
 return jsonb_build_object('success',true,'strategy_id',v_id,'status','pending_review');
end $$;

revoke all on function public.zynth_admin_promote_trader(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zynth_admin_promote_trader(uuid,uuid) to authenticated;
