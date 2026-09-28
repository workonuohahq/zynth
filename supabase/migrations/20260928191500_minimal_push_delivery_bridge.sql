-- Minimal server-side data bridge for direct Web Push.
-- No queue or scheduler: the ZYNTH sender reads the notification and active devices
-- through a single secret-gated RPC, then Web Pushes directly to the browser.

create or replace function public.zynth_get_push_delivery_context(
  p_notification_id uuid,
  p_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice jsonb;
  v_preferences jsonb;
  v_subscriptions jsonb;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name='zynth_push_worker_secret'
      and decrypted_secret=p_secret
  ) then
    raise exception 'Unauthorized';
  end if;

  select to_jsonb(n)
  into v_notice
  from public.notifications n
  where n.id=p_notification_id;

  if v_notice is null then
    return jsonb_build_object('notification',null);
  end if;

  select coalesce(to_jsonb(p),'{}'::jsonb)
  into v_preferences
  from public.zynth_notification_preferences p
  where p.user_id=(v_notice->>'user_id')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',s.id,
        'endpoint',s.endpoint,
        'p256dh',s.p256dh,
        'auth',s.auth
      )
    ),
    '[]'::jsonb
  )
  into v_subscriptions
  from public.zynth_push_subscriptions s
  where s.user_id=(v_notice->>'user_id')::uuid
    and s.revoked_at is null;

  return jsonb_build_object(
    'notification',v_notice,
    'preferences',coalesce(v_preferences,'{}'::jsonb),
    'subscriptions',v_subscriptions
  );
end;
$$;

revoke all on function public.zynth_get_push_delivery_context(uuid,text) from public;
grant execute on function public.zynth_get_push_delivery_context(uuid,text) to anon;

create or replace function public.zynth_revoke_push_subscription(
  p_subscription_id uuid,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name='zynth_push_worker_secret'
      and decrypted_secret=p_secret
  ) then
    raise exception 'Unauthorized';
  end if;

  update public.zynth_push_subscriptions
  set revoked_at=now()
  where id=p_subscription_id
    and revoked_at is null;
end;
$$;

revoke all on function public.zynth_revoke_push_subscription(uuid,text) from public;
grant execute on function public.zynth_revoke_push_subscription(uuid,text) to anon;
