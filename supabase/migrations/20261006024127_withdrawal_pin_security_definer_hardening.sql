-- Final withdrawal-PIN SECURITY DEFINER hardening.
-- pgcrypto is installed in the extensions schema. Keep search_path empty and
-- explicitly qualify extension calls so future search_path hardening cannot
-- break PIN operations or expose privileged name resolution.

create or replace function public.zynth_change_withdrawal_pin(p_current_pin text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  p record;
  ok boolean;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
  if p_new_pin in ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','012345','543210') then raise exception 'PIN_TOO_WEAK'; end if;

  select * into p from public.zynth_withdrawal_pins where user_id=uid for update;
  if not found then raise exception 'PIN_NOT_SET'; end if;
  if p.locked_until is not null and p.locked_until>now() then raise exception 'PIN_LOCKED'; end if;

  ok:=p_current_pin is not null
    and p_current_pin ~ '^[0-9]{6}$'
    and extensions.crypt(p_current_pin,p.pin_hash)=p.pin_hash;
  if not ok then raise exception 'INVALID_PIN'; end if;

  update public.zynth_withdrawal_pins
  set pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),
      failed_attempts=0,locked_until=null,last_changed_at=now(),updated_at=now()
  where user_id=uid;

  insert into public.zynth_withdrawal_security_events(user_id,event_type)
  values(uid,'pin_changed');
  return jsonb_build_object('ok',true,'configured',true);
end;
$function$;

create or replace function public.zynth_set_withdrawal_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid:=auth.uid();
  existing boolean;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
  if p_pin in ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','012345','543210') then raise exception 'PIN_TOO_WEAK'; end if;

  select exists(select 1 from public.zynth_withdrawal_pins where user_id=uid) into existing;
  if existing then raise exception 'PIN_ALREADY_SET'; end if;

  insert into public.zynth_withdrawal_pins(user_id,pin_hash)
  values(uid,extensions.crypt(p_pin,extensions.gen_salt('bf',10)));
  insert into public.zynth_withdrawal_security_events(user_id,event_type)
  values(uid,'pin_set');
  return jsonb_build_object('ok',true,'configured',true);
end;
$function$;

create or replace function public.zynth_withdrawal_pin_check(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid:=auth.uid();
  p record;
  ok boolean;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into p from public.zynth_withdrawal_pins where user_id=uid for update;
  if not found then raise exception 'PIN_NOT_SET'; end if;
  if p.locked_until is not null and p.locked_until>now() then raise exception 'PIN_LOCKED'; end if;

  ok:=p_pin is not null and p_pin ~ '^[0-9]{6}$'
    and extensions.crypt(p_pin,p.pin_hash)=p.pin_hash;

  if ok then
    update public.zynth_withdrawal_pins
    set failed_attempts=0,locked_until=null,last_verified_at=now(),updated_at=now()
    where user_id=uid;
    insert into public.zynth_withdrawal_security_events(user_id,event_type)
    values(uid,'pin_success');
    return true;
  end if;

  if p.failed_attempts+1>=5 then
    update public.zynth_withdrawal_pins
    set failed_attempts=5,locked_until=now()+interval '15 minutes',updated_at=now()
    where user_id=uid;
    insert into public.zynth_withdrawal_security_events(user_id,event_type,risk_score)
    values(uid,'pin_locked',80);
    raise exception 'PIN_LOCKED';
  else
    update public.zynth_withdrawal_pins
    set failed_attempts=failed_attempts+1,updated_at=now()
    where user_id=uid;
    insert into public.zynth_withdrawal_security_events(user_id,event_type,risk_score)
    values(uid,'pin_failure',50);
    raise exception 'INVALID_PIN';
  end if;
end;
$function$;

create or replace function public.zynth_withdrawal_pin_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare p record;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into p from public.zynth_withdrawal_pins where user_id=auth.uid();
  return jsonb_build_object(
    'configured',p is not null,
    'locked_until',case when p is null then null else p.locked_until end,
    'failed_attempts',case when p is null then 0 else p.failed_attempts end,
    'last_changed_at',case when p is null then null else p.last_changed_at end
  );
end;
$function$;
