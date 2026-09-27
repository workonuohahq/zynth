-- ZYNTH multi-role RBAC foundation.
-- Roles are additive; users can hold multiple roles simultaneously.
-- The legacy users.role column remains as a compatibility primary role until all consumers migrate.

create table if not exists public.zynth_roles (
 id uuid primary key default gen_random_uuid(),
 key text not null unique,
 name text not null,
 description text,
 icon text,
 color text,
 assignment_policy text not null default 'admin',
 is_system boolean not null default false,
 is_active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.zynth_permissions (
 id uuid primary key default gen_random_uuid(),
 key text not null unique,
 name text not null,
 description text,
 category text,
 is_system boolean not null default true,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.zynth_role_permissions (
 role_id uuid not null references public.zynth_roles(id) on delete cascade,
 permission_id uuid not null references public.zynth_permissions(id) on delete cascade,
 primary key(role_id,permission_id)
);

create table if not exists public.zynth_user_roles (
 user_id uuid not null references public.users(id) on delete cascade,
 role_id uuid not null references public.zynth_roles(id) on delete restrict,
 assigned_by uuid references public.users(id) on delete set null,
 assigned_at timestamptz not null default now(),
 expires_at timestamptz,
 is_active boolean not null default true,
 primary key(user_id,role_id)
);

insert into public.zynth_roles(key,name,description,assignment_policy,is_system,sort_order) values
 ('investor','Investor','Access to the investor experience, portfolio and personal financial activity.','automatic_or_admin',true,10),
 ('trader','Trader','Access to Trader Desk, strategy operations and trader reporting.','admin',true,20),
 ('admin','Administrator','Administrative access to ZYNTH control functions.','super_admin',true,30),
 ('zpa','ZPA','ZYNTH Partner Agent network access.','admin',true,40)
on conflict(key) do update set name=excluded.name,description=excluded.description,assignment_policy=excluded.assignment_policy;

insert into public.zynth_permissions(key,name,description,category) values
 ('dashboard.view','View dashboard','Access the authenticated platform dashboard.','platform'),
 ('investments.view','View investments','View personal investment positions and portfolio.','investor'),
 ('investments.create','Create investments','Start an investment through the approved funding flow.','investor'),
 ('wallet.view','View wallet','View personal available and locked balances.','investor'),
 ('withdrawals.create','Request withdrawals','Create eligible withdrawal requests.','investor'),
 ('referrals.view','View referrals','Access referral activity and rewards.','investor'),
 ('trader.desk','Access Trader Desk','Access trader operating tools.','trader'),
 ('trader.strategy.create','Create strategies','Propose trading strategies for review.','trader'),
 ('trader.report.submit','Submit trader reports','Submit daily valuation reports.','trader'),
 ('trader.mt5.manage','Manage MT5','Manage trader MT5 verification details.','trader'),
 ('admin.panel','Access Admin Panel','Access ZYNTH administration.','admin'),
 ('admin.users.manage','Manage users','Manage user profiles, roles and account state.','admin'),
 ('admin.money.manage','Manage money movement','Review deposits, withdrawals and redemptions.','admin'),
 ('admin.traders.manage','Manage traders','Manage trader onboarding and trader operations.','admin'),
 ('admin.settings.manage','Manage settings','Manage platform configuration.','admin'),
 ('support.manage','Manage customer service','Operate customer support conversations.','operations'),
 ('zpa.dashboard','Access ZPA','Access ZPA network functions.','zpa')
on conflict(key) do update set name=excluded.name,description=excluded.description,category=excluded.category;

insert into public.zynth_role_permissions(role_id,permission_id)
select r.id,p.id from public.zynth_roles r cross join public.zynth_permissions p
where (r.key='investor' and p.key in ('dashboard.view','investments.view','investments.create','wallet.view','withdrawals.create','referrals.view'))
   or (r.key='trader' and p.key in ('dashboard.view','trader.desk','trader.strategy.create','trader.report.submit','trader.mt5.manage','investments.view','wallet.view'))
   or (r.key='admin' and p.key like 'admin.%')
   or (r.key='admin' and p.key in ('dashboard.view','support.manage'))
   or (r.key='zpa' and p.key='zpa.dashboard')
on conflict do nothing;

insert into public.zynth_user_roles(user_id,role_id,assigned_by,is_active)
select u.id,r.id,null,true from public.users u join public.zynth_roles r on r.key=case when u.role::text='user' then 'investor' else u.role::text end
on conflict(user_id,role_id) do update set is_active=true;

create index if not exists zynth_user_roles_user_idx on public.zynth_user_roles(user_id,is_active);
create index if not exists zynth_user_roles_role_idx on public.zynth_user_roles(role_id,is_active);
create index if not exists zynth_role_permissions_permission_idx on public.zynth_role_permissions(permission_id);

create or replace function public.zynth_has_role(p_user_id uuid,p_role_key text)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
 select exists(select 1 from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id where ur.user_id=p_user_id and r.key=p_role_key and ur.is_active and (ur.expires_at is null or ur.expires_at>now()))
 or exists(select 1 from public.users u where u.id=p_user_id and ((p_role_key='investor' and u.role::text='user') or u.role::text=p_role_key));
$$;

create or replace function public.zynth_has_permission(p_user_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
 select exists(select 1 from public.zynth_user_roles ur join public.zynth_role_permissions rp on rp.role_id=ur.role_id join public.zynth_permissions p on p.id=rp.permission_id where ur.user_id=p_user_id and ur.is_active and p.is_active and p.key=p_permission_key and (ur.expires_at is null or ur.expires_at>now()));
$$;

create or replace function public.zynth_admin_role_catalog(p_admin_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',key,'name',name,'description',description,'assignment_policy',assignment_policy,'is_system',is_system,'is_active',is_active,'sort_order',sort_order) order by sort_order,key) from public.zynth_roles where is_active),'[]'::jsonb);
end $$;

create or replace function public.zynth_admin_get_user_roles(p_admin_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',r.key,'name',r.name,'description',r.description,'assignment_policy',r.assignment_policy,'is_active',ur.is_active,'assigned_at',ur.assigned_at,'expires_at',ur.expires_at) order by r.sort_order) from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id where ur.user_id=p_user_id and ur.is_active),'[]'::jsonb);
end $$;

create or replace function public.zynth_admin_set_user_roles(p_admin_id uuid,p_user_id uuid,p_role_keys text[]) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare k text; v_role_id uuid; old_keys text[]; new_keys text[];
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if not exists(select 1 from public.users where id=p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
 if p_role_keys is null or coalesce(array_length(p_role_keys,1),0)=0 then raise exception 'AT_LEAST_ONE_ROLE_REQUIRED'; end if;
 select coalesce(array_agg(r.key order by r.key),'{}') into old_keys from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id where ur.user_id=p_user_id and ur.is_active;
 select coalesce(array_agg(distinct lower(trim(x)) order by lower(trim(x))),'{}') into new_keys from unnest(p_role_keys) x where lower(trim(x))<>'' and exists(select 1 from public.zynth_roles r where r.key=lower(trim(x)) and r.is_active);
 if coalesce(array_length(new_keys,1),0)<>coalesce(array_length(p_role_keys,1),0) then raise exception 'INVALID_ROLE_SELECTED'; end if;
 if p_user_id=auth.uid() and not ('admin'=any(new_keys)) then raise exception 'CANNOT_REMOVE_ADMIN_ACCESS_FROM_SELF'; end if;
 delete from public.zynth_user_roles where user_id=p_user_id;
 foreach k in array new_keys loop select id into v_role_id from public.zynth_roles where key=k; insert into public.zynth_user_roles(user_id,role_id,assigned_by,is_active) values(p_user_id,v_role_id,auth.uid(),true); end loop;
 update public.users set role=case when 'admin'=any(new_keys) then 'admin'::user_role when 'trader'=any(new_keys) then 'trader'::user_role when 'zpa'=any(new_keys) then 'zpa'::user_role else 'user'::user_role end,updated_at=now() where id=p_user_id;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(auth.uid(),'user.roles_changed','user',p_user_id,jsonb_build_object('from',old_keys,'to',new_keys));
 return jsonb_build_object('ok',true,'user_id',p_user_id,'roles',new_keys);
end $$;

create or replace function public.zynth_admin_user_roles_map(p_admin_id uuid,p_user_ids uuid[]) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
 if auth.uid() is null or auth.uid()<>p_admin_id or not public.zynth_has_role(auth.uid(),'admin') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return coalesce((select jsonb_object_agg(x.user_id::text,x.roles) from (select ur.user_id,jsonb_agg(jsonb_build_object('key',r.key,'name',r.name) order by r.sort_order,r.key) roles from public.zynth_user_roles ur join public.zynth_roles r on r.id=ur.role_id where ur.user_id=any(p_user_ids) and ur.is_active group by ur.user_id)x),'{}'::jsonb);
end $$;

revoke all on function public.zynth_has_role(uuid,text),public.zynth_has_permission(uuid,text),public.zynth_admin_role_catalog(uuid),public.zynth_admin_get_user_roles(uuid,uuid),public.zynth_admin_set_user_roles(uuid,uuid,text[]),public.zynth_admin_user_roles_map(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.zynth_has_role(uuid,text),public.zynth_has_permission(uuid,text),public.zynth_admin_role_catalog(uuid),public.zynth_admin_get_user_roles(uuid,uuid),public.zynth_admin_set_user_roles(uuid,uuid,text[]),public.zynth_admin_user_roles_map(uuid,uuid[]) to authenticated;

alter table public.zynth_roles enable row level security;
alter table public.zynth_permissions enable row level security;
alter table public.zynth_role_permissions enable row level security;
alter table public.zynth_user_roles enable row level security;
