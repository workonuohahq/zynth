create table if not exists private.zynth_protected_admin (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete restrict,
  label text not null default 'Primary administrator',
  protected_at timestamptz not null default now()
);

insert into private.zynth_protected_admin (singleton, user_id, label)
values (true, '22b36cb5-eada-4078-8458-c3abe80fb0cd'::uuid, 'ZYNTH primary administrator')
on conflict (singleton) do nothing;

do $$
begin
  if not exists (
    select 1 from private.zynth_protected_admin
    where singleton = true and user_id = '22b36cb5-eada-4078-8458-c3abe80fb0cd'::uuid
  ) then
    raise exception 'PROTECTED_ADMIN_IDENTITY_MISMATCH';
  end if;
end;
$$;

revoke all on table private.zynth_protected_admin from public, anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_protected_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select exists (
    select 1
    from private.zynth_protected_admin p
    where p.singleton = true and p.user_id = p_user_id
  );
$$;

revoke all on function private.is_protected_admin(uuid) from public, anon, authenticated, service_role;

create or replace function public.zynth_is_protected_admin(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return private.is_protected_admin(p_user_id);
  end if;
  if auth.uid() is null or not public.zynth_has_role(auth.uid(), 'admin') then
    return false;
  end if;
  return private.is_protected_admin(p_user_id);
end;
$$;

revoke all on function public.zynth_is_protected_admin(uuid) from public, anon;
grant execute on function public.zynth_is_protected_admin(uuid) to authenticated, service_role;

create or replace function private.guard_protected_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if private.is_protected_admin(old.id) then
    if tg_op = 'DELETE' then raise exception 'PRIMARY_ADMIN_PROTECTED'; end if;
    if new.account_status is distinct from 'active'
       or new.role::text is distinct from 'admin' then
      raise exception 'PRIMARY_ADMIN_PROTECTED';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_protected_admin_role_assignments()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_old_user_id uuid;
  v_new_user_id uuid;
begin
  if tg_op <> 'INSERT' then v_old_user_id := old.user_id; end if;
  if tg_op <> 'DELETE' then v_new_user_id := new.user_id; end if;
  if (v_old_user_id is not null and private.is_protected_admin(v_old_user_id))
     or (v_new_user_id is not null and private.is_protected_admin(v_new_user_id)) then
    raise exception 'PRIMARY_ADMIN_PROTECTED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.guard_protected_admin_auth_delete()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
begin
  if private.is_protected_admin(old.id) then raise exception 'PRIMARY_ADMIN_PROTECTED'; end if;
  return old;
end;
$$;

drop trigger if exists zynth_protect_primary_admin_profile_update on public.users;
create trigger zynth_protect_primary_admin_profile_update
before update on public.users
for each row
when (old.account_status is distinct from new.account_status or old.role is distinct from new.role)
execute function private.guard_protected_admin_profile();

drop trigger if exists zynth_protect_primary_admin_profile_delete on public.users;
create trigger zynth_protect_primary_admin_profile_delete
before delete on public.users
for each row
execute function private.guard_protected_admin_profile();

drop trigger if exists zynth_protect_primary_admin_roles on public.zynth_user_roles;
create trigger zynth_protect_primary_admin_roles
before insert or update or delete on public.zynth_user_roles
for each row
execute function private.guard_protected_admin_role_assignments();

drop trigger if exists zynth_protect_primary_admin_auth_delete on auth.users;
create trigger zynth_protect_primary_admin_auth_delete
before delete on auth.users
for each row
execute function private.guard_protected_admin_auth_delete();

comment on table private.zynth_protected_admin is
  'Private identity anchor for the ZYNTH primary administrator. Ordinary application operations cannot modify this record.';
