-- Reuse the stable PWA credential-backed security session instead of
-- inserting duplicate session hashes after expiry/revocation.

create or replace function public.zynth_security_register_session(
  p_session_key text,
  p_device_id uuid,
  p_user_agent text default null,
  p_ip_hash text default null,
  p_ip_country text default null,
  p_ip_region text default null,
  p_ip_city text default null,
  p_session_family text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_hash text;
  v_family_hash text;
begin
  if v_user is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if p_device_id is not null and not exists (
    select 1
    from public.zynth_security_devices
    where id = p_device_id
      and user_id = v_user
      and revoked_at is null
  ) then
    raise exception 'INVALID_DEVICE';
  end if;

  if length(coalesce(p_session_key,'')) < 20 then
    raise exception 'INVALID_SESSION_KEY';
  end if;

  v_hash := encode(digest(p_session_key,'sha256'),'hex');
  v_family_hash := case
    when p_session_family is null then null
    else encode(digest(p_session_family,'sha256'),'hex')
  end;

  update public.zynth_security_sessions
  set device_id = p_device_id,
      user_agent = left(p_user_agent,500),
      ip_hash = left(p_ip_hash,128),
      ip_country = left(p_ip_country,80),
      ip_region = left(p_ip_region,120),
      ip_city = left(p_ip_city,120),
      session_family_hash = v_family_hash,
      expires_at = p_expires_at,
      revoked_at = null,
      last_seen_at = now(),
      current = true
  where user_id = v_user
    and session_key_hash = v_hash
  returning id into v_id;

  if v_id is not null then
    update public.zynth_security_sessions
    set current = false
    where user_id = v_user
      and revoked_at is null
      and id <> v_id;

    return v_id;
  end if;

  update public.zynth_security_sessions
  set current = false
  where user_id = v_user
    and revoked_at is null;

  insert into public.zynth_security_sessions(
    user_id, device_id, session_key_hash, session_family_hash,
    ip_hash, ip_country, ip_region, ip_city, user_agent,
    expires_at, current
  )
  values(
    v_user, p_device_id, v_hash, v_family_hash,
    left(p_ip_hash,128), left(p_ip_country,80), left(p_ip_region,120),
    left(p_ip_city,120), p_user_agent, p_expires_at, true
  )
  returning id into v_id;

  return v_id;
end
$function$;