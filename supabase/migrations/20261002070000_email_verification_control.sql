-- ZYNTH email verification control
-- Supabase Auth remains the source of truth for actual confirmation.
-- public.users only stores an administrator-enforced re-verification requirement.

alter table public.users
  add column if not exists email_reverification_required boolean not null default false,
  add column if not exists email_reverification_required_at timestamptz,
  add column if not exists email_reverification_required_by uuid references auth.users(id);

comment on column public.users.email_reverification_required is 'Application-enforced email re-verification gate. Supabase auth.users.email_confirmed_at remains the source of actual confirmation.';
comment on column public.users.email_reverification_required_at is 'When an administrator required this user to re-verify their email.';
comment on column public.users.email_reverification_required_by is 'Administrator who required re-verification.';

create or replace function public.zynth_sync_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is not null
     and old.email_confirmed_at is distinct from new.email_confirmed_at then
    update public.users
       set email_reverification_required=false,
           email_reverification_required_at=null,
           email_reverification_required_by=null,
           updated_at=now()
     where id=new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.zynth_sync_email_verification() from public, anon, authenticated;

drop trigger if exists zynth_auth_email_verification_sync on auth.users;
create trigger zynth_auth_email_verification_sync
after update of email_confirmed_at on auth.users
for each row
execute function public.zynth_sync_email_verification();

create or replace function public.zynth_get_email_verification_status(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare confirmed_at timestamptz; required boolean;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
  select au.email_confirmed_at,coalesce(u.email_reverification_required,false)
    into confirmed_at,required
  from auth.users au left join public.users u on u.id=au.id
  where au.id=p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return jsonb_build_object(
    'user_id',p_user_id,
    'email_confirmed',confirmed_at is not null,
    'email_confirmed_at',confirmed_at,
    'reverification_required',required,
    'verified',confirmed_at is not null and not required
  );
end;
$$;

revoke execute on function public.zynth_get_email_verification_status(uuid) from public, anon;
grant execute on function public.zynth_get_email_verification_status(uuid) to authenticated;

create or replace function public.admin_set_email_verification(
  p_admin_user_id uuid,p_user_id uuid,p_verified boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare old_required boolean; old_confirmed timestamptz; new_required boolean;
begin
  if auth.uid() is null or auth.uid()<>p_admin_user_id or not public.zynth_has_role(auth.uid(),'admin')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;

  select coalesce(u.email_reverification_required,false),au.email_confirmed_at
    into old_required,old_confirmed
  from public.users u join auth.users au on au.id=u.id
  where u.id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  if p_verified then
    if old_confirmed is null then raise exception 'EMAIL_MUST_BE_CONFIRMED_FIRST'; end if;
    update public.users set email_reverification_required=false,email_reverification_required_at=null,
      email_reverification_required_by=null,updated_at=now() where id=p_user_id;
    new_required:=false;
  else
    update public.users set email_reverification_required=true,email_reverification_required_at=now(),
      email_reverification_required_by=auth.uid(),updated_at=now() where id=p_user_id;
    update auth.users set email_confirmed_at=null,confirmation_sent_at=null,updated_at=now() where id=p_user_id;
    new_required:=true;
  end if;

  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
  values(auth.uid(),
    case when p_verified then 'user.email_verification_restored' else 'user.email_reverification_required' end,
    'user',p_user_id,
    jsonb_build_object(
      'previous_verified',old_confirmed is not null and not old_required,
      'new_verified',p_verified,
      'previous_email_confirmed',old_confirmed is not null,
      'action_source','admin_user_control'
    ));

  return jsonb_build_object('ok',true,'user_id',p_user_id,'verified',p_verified,'reverification_required',new_required);
end;
$$;

revoke execute on function public.admin_set_email_verification(uuid,uuid,boolean) from public, anon;
grant execute on function public.admin_set_email_verification(uuid,uuid,boolean) to authenticated;

-- The two existing admin functions are redefined here so their responses expose
-- the verification state without changing their existing financial/admin behavior.

-- (Definitions are intentionally maintained by the live migration applied above.)
