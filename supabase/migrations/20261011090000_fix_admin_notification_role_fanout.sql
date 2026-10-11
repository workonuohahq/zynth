-- Fix admin notification fan-out for events created in a non-admin user session.
-- zynth_has_role() intentionally prevents checking another user's role when auth.uid()
-- is set. Calling it from this SECURITY DEFINER fan-out therefore excludes admins
-- for user-originated events. Check authoritative role tables directly here.

create or replace function public.zynth_emit_admin_notification(
  p_event_key text,
  p_title text,
  p_body text,
  p_type text default 'system',
  p_priority text default 'normal',
  p_action_url text default '/admin'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid;
  v_count integer := 0;
  v_existing public.notifications%rowtype;
  v_existing_count integer;
  v_window_seconds integer;
  v_priority text := case when p_priority in ('normal','attention','critical') then p_priority else 'normal' end;
  v_action_url text := coalesce(nullif(p_action_url,''),'/admin');
  v_type text := coalesce(nullif(p_type,''),'system');
  v_dedupe_key text;
begin
  if p_event_key is null or btrim(p_event_key) = '' or p_title is null or p_body is null then
    return 0;
  end if;

  v_window_seconds := case v_priority when 'critical' then 180 when 'attention' then 300 else 600 end;

  for v_admin in
    select u.id
    from public.users u
    where u.account_status = 'active'
      and (
        u.role::text = 'admin'
        or exists (
          select 1
          from public.zynth_user_roles ur
          join public.zynth_roles r on r.id = ur.role_id
          where ur.user_id = u.id
            and r.key = 'admin'
            and ur.is_active
            and r.is_active
            and (ur.expires_at is null or ur.expires_at > now())
        )
      )
  loop
    v_dedupe_key := md5(coalesce(v_admin::text,'')||'|'||p_event_key||'|'||v_type||'|'||v_priority||'|'||v_action_url);
    perform pg_catalog.pg_advisory_xact_lock(hashtextextended(v_dedupe_key,0));

    select *
    into v_existing
    from public.notifications n
    where n.user_id = v_admin
      and n.read_at is null
      and n.metadata->>'admin' = 'true'
      and n.metadata->>'event' = p_event_key
      and n.metadata->>'type' = v_type
      and n.metadata->>'priority' = v_priority
      and n.metadata->>'action_url' = v_action_url
      and n.created_at >= now() - make_interval(secs => v_window_seconds)
    order by n.created_at desc
    limit 1
    for update;

    if found then
      v_existing_count := greatest(coalesce(nullif(v_existing.metadata->>'dedupe_count','')::integer,1),1) + 1;
      update public.notifications
      set updated_at = clock_timestamp(),
          title = p_title || ' · ' || v_existing_count || ' events',
          body = v_existing_count || ' similar events are grouped here. Latest: ' || left(p_body,360),
          metadata = v_existing.metadata || jsonb_build_object(
            'dedupe_key',v_dedupe_key,
            'dedupe_count',v_existing_count,
            'dedupe_window_seconds',v_window_seconds,
            'dedupe_first_at',coalesce(v_existing.metadata->>'dedupe_first_at',v_existing.created_at::text),
            'dedupe_last_at',clock_timestamp()::text,
            'latest_body',left(p_body,500)
          )
      where id = v_existing.id;
    else
      insert into public.notifications(user_id,title,body,type,metadata)
      values(v_admin,p_title,p_body,v_type,jsonb_build_object(
        'event',p_event_key,
        'priority',v_priority,
        'action_url',v_action_url,
        'admin',true,
        'type',v_type,
        'dedupe_key',v_dedupe_key,
        'dedupe_count',1,
        'dedupe_window_seconds',v_window_seconds,
        'dedupe_first_at',clock_timestamp()::text,
        'dedupe_last_at',clock_timestamp()::text
      ));
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end
$function$;

-- This is an internal trigger helper. Trigger callers execute it through their
-- SECURITY DEFINER functions; clients must not invoke it directly.
revoke all on function public.zynth_emit_admin_notification(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.zynth_emit_admin_notification(text,text,text,text,text,text) to service_role;
