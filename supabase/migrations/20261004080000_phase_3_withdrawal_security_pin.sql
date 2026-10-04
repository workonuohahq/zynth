-- Phase 3: withdrawal security / withdrawal PIN
-- Applied to production first, then captured here for repository parity.

create table if not exists public.zynth_withdrawal_pins (
  user_id uuid primary key references public.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  last_verified_at timestamptz,
  last_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zynth_withdrawal_pins enable row level security;
revoke all on public.zynth_withdrawal_pins from anon,authenticated,public;
grant select,insert,update,delete on public.zynth_withdrawal_pins to service_role;

create table if not exists public.zynth_withdrawal_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('pin_set','pin_changed','pin_success','pin_failure','pin_locked','withdrawal_blocked_pin','withdrawal_submitted','beneficiary_added')),
  withdrawal_id uuid,
  beneficiary_id uuid,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_zynth_wse_user_created on public.zynth_withdrawal_security_events(user_id,created_at desc);
alter table public.zynth_withdrawal_security_events enable row level security;
revoke all on public.zynth_withdrawal_security_events from anon,authenticated,public;
grant select,insert,update,delete on public.zynth_withdrawal_security_events to service_role;

alter table public.withdrawal_beneficiaries add column if not exists security_locked_until timestamptz;
alter table public.withdrawal_beneficiaries add column if not exists last_changed_at timestamptz;
revoke insert,update,delete on public.withdrawal_beneficiaries from anon,authenticated,public;
grant select on public.withdrawal_beneficiaries to authenticated;

create or replace function public.zynth_withdrawal_pin_status()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p record;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select * into p from public.zynth_withdrawal_pins where user_id=auth.uid();
 return jsonb_build_object('configured',p is not null,'locked_until',case when p is null then null else p.locked_until end,'failed_attempts',case when p is null then 0 else p.failed_attempts end,'last_changed_at',case when p is null then null else p.last_changed_at end);
end; $$;

create or replace function public.zynth_set_withdrawal_pin(p_pin text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); existing boolean;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
 if p_pin in ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','012345','543210') then raise exception 'PIN_TOO_WEAK'; end if;
 select exists(select 1 from public.zynth_withdrawal_pins where user_id=uid) into existing;
 if existing then raise exception 'PIN_ALREADY_SET'; end if;
 insert into public.zynth_withdrawal_pins(user_id,pin_hash) values(uid,crypt(p_pin,gen_salt('bf',10)));
 insert into public.zynth_withdrawal_security_events(user_id,event_type) values(uid,'pin_set');
 return jsonb_build_object('ok',true,'configured',true);
end; $$;

create or replace function public.zynth_change_withdrawal_pin(p_current_pin text,p_new_pin text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); p record; ok boolean;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
 if p_new_pin in ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','012345','543210') then raise exception 'PIN_TOO_WEAK'; end if;
 select * into p from public.zynth_withdrawal_pins where user_id=uid for update;
 if not found then raise exception 'PIN_NOT_SET'; end if;
 if p.locked_until is not null and p.locked_until>now() then raise exception 'PIN_LOCKED'; end if;
 ok:=p_current_pin is not null and p_current_pin ~ '^[0-9]{6}$' and crypt(p_current_pin,p.pin_hash)=p.pin_hash;
 if not ok then raise exception 'INVALID_PIN'; end if;
 update public.zynth_withdrawal_pins set pin_hash=crypt(p_new_pin,gen_salt('bf',10)),failed_attempts=0,locked_until=null,last_changed_at=now(),updated_at=now() where user_id=uid;
 insert into public.zynth_withdrawal_security_events(user_id,event_type) values(uid,'pin_changed');
 return jsonb_build_object('ok',true,'configured',true);
end; $$;

create or replace function public.zynth_withdrawal_pin_check(p_pin text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); p record; ok boolean;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select * into p from public.zynth_withdrawal_pins where user_id=uid for update;
 if not found then raise exception 'PIN_NOT_SET'; end if;
 if p.locked_until is not null and p.locked_until>now() then raise exception 'PIN_LOCKED'; end if;
 ok:=p_pin is not null and p_pin ~ '^[0-9]{6}$' and crypt(p_pin,p.pin_hash)=p.pin_hash;
 if ok then
   update public.zynth_withdrawal_pins set failed_attempts=0,locked_until=null,last_verified_at=now(),updated_at=now() where user_id=uid;
   insert into public.zynth_withdrawal_security_events(user_id,event_type) values(uid,'pin_success');
   return true;
 end if;
 if p.failed_attempts+1>=5 then
   update public.zynth_withdrawal_pins set failed_attempts=5,locked_until=now()+interval '15 minutes',updated_at=now() where user_id=uid;
   insert into public.zynth_withdrawal_security_events(user_id,event_type,risk_score) values(uid,'pin_locked',80);
   raise exception 'PIN_LOCKED';
 end if;
 update public.zynth_withdrawal_pins set failed_attempts=failed_attempts+1,updated_at=now() where user_id=uid;
 insert into public.zynth_withdrawal_security_events(user_id,event_type,risk_score) values(uid,'pin_failure',50);
 raise exception 'INVALID_PIN';
end; $$;

create or replace function public.zynth_add_withdrawal_beneficiary(p_bank_name text,p_account_number text,p_account_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); bid uuid; first_one boolean;
begin
 if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if nullif(trim(p_bank_name),'') is null or p_account_number !~ '^[0-9]{10}$' or nullif(trim(p_account_name),'') is null then raise exception 'INVALID_BENEFICIARY'; end if;
 select not exists(select 1 from public.withdrawal_beneficiaries where user_id=uid) into first_one;
 insert into public.withdrawal_beneficiaries(user_id,bank_name,account_number,account_name,is_verified,is_default,security_locked_until,last_changed_at)
 values(uid,trim(p_bank_name),p_account_number,trim(p_account_name),false,first_one,now()+interval '24 hours',now()) returning id into bid;
 insert into public.zynth_withdrawal_security_events(user_id,event_type,beneficiary_id,metadata)
 values(uid,'beneficiary_added',bid,jsonb_build_object('cooling_hours',24));
 return jsonb_build_object('ok',true,'beneficiary_id',bid,'security_locked_until',now()+interval '24 hours');
exception when unique_violation then raise exception 'BENEFICIARY_ALREADY_EXISTS';
end; $$;

create or replace function public.request_withdrawal_by_source(
 p_user_id uuid,p_amount numeric,p_beneficiary_id uuid,p_source text,p_pin text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'AUTHORIZATION_REQUIRED'; end if;
 perform public.zynth_withdrawal_pin_check(p_pin);
 if not exists(select 1 from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id) then raise exception 'BENEFICIARY_NOT_FOUND'; end if;
 if exists(select 1 from public.withdrawal_beneficiaries where id=p_beneficiary_id and user_id=p_user_id and security_locked_until is not null and security_locked_until>now()) then raise exception 'BENEFICIARY_COOLING_DOWN'; end if;
 return public.request_withdrawal_by_source(p_user_id,p_amount,p_beneficiary_id,p_source);
end; $$;

revoke execute on function public.zynth_withdrawal_pin_status() from public,anon;
revoke execute on function public.zynth_set_withdrawal_pin(text) from public,anon;
revoke execute on function public.zynth_change_withdrawal_pin(text,text) from public,anon;
revoke execute on function public.zynth_withdrawal_pin_check(text) from public,anon,authenticated;
revoke execute on function public.zynth_add_withdrawal_beneficiary(text,text,text) from public,anon;
revoke execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text) from public,anon,authenticated;
revoke execute on function public.request_withdrawal(uuid,numeric,uuid) from public,anon,authenticated;
revoke execute on function public.request_profit_withdrawal(uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.zynth_withdrawal_pin_status() to authenticated;
grant execute on function public.zynth_set_withdrawal_pin(text) to authenticated;
grant execute on function public.zynth_change_withdrawal_pin(text,text) to authenticated;
grant execute on function public.zynth_add_withdrawal_beneficiary(text,text,text) to authenticated;
grant execute on function public.request_withdrawal_by_source(uuid,numeric,uuid,text,text) to authenticated;
