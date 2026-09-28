-- ZYNTH Messaging Broadcast Center
create table if not exists public.zynth_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  audience jsonb not null default '{}'::jsonb,
  channel_in_app boolean not null default true,
  channel_push boolean not null default true,
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  action_url text,
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  recipient_count integer not null default 0,
  push_eligible_count integer not null default 0,
  push_sent_count integer not null default 0,
  push_failed_count integer not null default 0,
  push_skipped_count integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.zynth_broadcast_recipients (
  broadcast_id uuid not null references public.zynth_broadcasts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  push_state text not null default 'not_requested' check (push_state in ('eligible','disabled','no_device','not_requested')),
  push_status text not null default 'queued' check (push_status in ('queued','sent','failed','skipped','not_requested')),
  push_delivered_at timestamptz,
  push_failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  primary key (broadcast_id,user_id),
  unique (notification_id)
);

create index if not exists idx_zynth_broadcasts_created_at on public.zynth_broadcasts(created_at desc);
create index if not exists idx_zynth_broadcast_recipients_broadcast on public.zynth_broadcast_recipients(broadcast_id);
create index if not exists idx_zynth_broadcast_recipients_user on public.zynth_broadcast_recipients(user_id);
create index if not exists idx_zynth_broadcast_recipients_notification on public.zynth_broadcast_recipients(notification_id);

alter table public.zynth_broadcasts enable row level security;
alter table public.zynth_broadcast_recipients enable row level security;

revoke all on public.zynth_broadcasts from anon, authenticated;
revoke all on public.zynth_broadcast_recipients from anon, authenticated;

create or replace function public.zynth_broadcast_candidates(p_audience jsonb)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role text,
  account_status text,
  kyc_verified boolean,
  funded boolean,
  push_state text
)
language sql
stable
security definer
set search_path to ''
as $$
  with candidates as (
    select
      u.id,
      u.full_name,
      u.email,
      u.role::text as role,
      u.account_status,
      coalesce(u.kyc_verified,false) as kyc_verified,
      (
        exists(select 1 from public.deposit_requests d where d.user_id=u.id and d.status='confirmed')
        or exists(select 1 from public.zynth_investments i where i.user_id=u.id)
      ) as funded,
      exists(
        select 1 from public.zynth_push_subscriptions ps
        where ps.user_id=u.id and ps.revoked_at is null
      ) as has_device,
      coalesce(np.push_enabled,true) as push_enabled,
      case when coalesce(np.push_enabled,true)=false then 'disabled'
           when exists(select 1 from public.zynth_push_subscriptions ps where ps.user_id=u.id and ps.revoked_at is null) then 'enabled'
           else 'no_device' end as push_state
    from public.users u
    left join public.zynth_notification_preferences np on np.user_id=u.id
    where u.role::text in ('user','trader','admin','zpa')
      and coalesce(u.account_status,'active')='active'
  )
  select
    c.id,
    c.full_name,
    c.email,
    c.role,
    c.account_status,
    c.kyc_verified,
    c.funded,
    case
      when c.push_enabled=false then 'disabled'
      when c.has_device then 'enabled'
      else 'no_device'
    end as push_state
  from candidates c
  where
    (
      coalesce(p_audience->>'role','all')='all'
      or (p_audience->>'role')='investors' and c.role='user'
      or (p_audience->>'role')='traders' and c.role='trader'
      or (p_audience->>'role')='users_except_traders' and c.role='user'
      or (p_audience->>'role')='admins' and c.role in ('admin','zpa')
      or (p_audience->>'role')='specific' and c.id::text in (
        select jsonb_array_elements_text(coalesce(p_audience->'user_ids','[]'::jsonb))
      )
    )
    and (
      coalesce(p_audience->>'funding','any')='any'
      or (p_audience->>'funding')='funded' and c.funded
      or (p_audience->>'funding')='unfunded' and not c.funded
    )
    and (
      coalesce(p_audience->>'push_status','any')='any'
      or (p_audience->>'push_status')=c.push_state
      or (p_audience->>'push_status')='disabled_or_no_device' and c.push_state in ('disabled','no_device')
    )
    and (
      coalesce(p_audience->>'account_status','active')='any'
      or (p_audience->>'account_status')=c.account_status
      or (p_audience->>'account_status')='verified' and c.kyc_verified
      or (p_audience->>'account_status')='unverified' and not c.kyc_verified
    )
$$;

create or replace function public.zynth_admin_broadcast_preview(
  p_admin_id uuid,
  p_audience jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  total_count integer;
  investors_count integer;
  traders_count integer;
  funded_count integer;
  unfunded_count integer;
  push_enabled_count integer;
  push_disabled_count integer;
  push_no_device_count integer;
begin
  if not public.zynth_has_role(auth.uid(),'admin')
     or not exists(select 1 from public.users where id=auth.uid() and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;

  select count(*),
    count(*) filter(where role='user'),
    count(*) filter(where role='trader'),
    count(*) filter(where funded),
    count(*) filter(where not funded),
    count(*) filter(where push_state='enabled'),
    count(*) filter(where push_state='disabled'),
    count(*) filter(where push_state='no_device')
  into total_count,investors_count,traders_count,funded_count,unfunded_count,push_enabled_count,push_disabled_count,push_no_device_count
  from public.zynth_broadcast_candidates(coalesce(p_audience,'{}'::jsonb));

  return jsonb_build_object(
    'recipient_count',total_count,
    'investors',investors_count,
    'traders',traders_count,
    'funded',funded_count,
    'unfunded',unfunded_count,
    'push_enabled',push_enabled_count,
    'push_disabled',push_disabled_count,
    'push_no_device',push_no_device_count
  );
end
$$;

create or replace function public.zynth_admin_broadcast_recipients(
  p_admin_id uuid,
  p_audience jsonb
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role text,
  funded boolean,
  push_state text
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.zynth_has_role(auth.uid(),'admin')
     or not exists(select 1 from public.users where id=auth.uid() and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  return query select c.user_id,c.full_name,c.email,c.role,c.funded,c.push_state
  from public.zynth_broadcast_candidates(coalesce(p_audience,'{}'::jsonb)) c
  order by c.full_name nulls last,c.email;
end
$$;

create or replace function public.zynth_admin_create_broadcast(
  p_admin_id uuid,
  p_title text,
  p_body text,
  p_audience jsonb,
  p_channel_in_app boolean,
  p_channel_push boolean,
  p_priority text,
  p_action_url text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  b_id uuid;
  r record;
  n_id uuid;
  eligible boolean;
  state text;
  total integer := 0;
  push_eligible integer := 0;
  push_skipped integer := 0;
begin
  if not public.zynth_has_role(auth.uid(),'admin')
     or not exists(select 1 from public.users where id=auth.uid() and account_status='active')
  then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
  if not p_channel_in_app and not p_channel_push then raise exception 'AT_LEAST_ONE_CHANNEL_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_title,'')))=0 or char_length(btrim(coalesce(p_body,'')))=0 then raise exception 'MESSAGE_REQUIRED'; end if;
  if char_length(p_title)>160 or char_length(p_body)>5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if p_priority not in ('normal','important','urgent') then raise exception 'INVALID_PRIORITY'; end if;
  if p_action_url is not null and p_action_url<>'' and left(p_action_url,1)<>'/' then raise exception 'ACTION_URL_MUST_BE_INTERNAL'; end if;

  insert into public.zynth_broadcasts(created_by,title,body,audience,channel_in_app,channel_push,priority,action_url,status)
  values(auth.uid(),btrim(p_title),btrim(p_body),coalesce(p_audience,'{}'::jsonb),p_channel_in_app,p_channel_push,p_priority,nullif(btrim(coalesce(p_action_url,'')),''),'sending')
  returning id into b_id;

  for r in select * from public.zynth_broadcast_candidates(coalesce(p_audience,'{}'::jsonb)) loop
    total := total + 1;
    state := r.push_state;
    eligible := p_channel_push and state='enabled';
    if eligible then push_eligible := push_eligible + 1; else push_skipped := push_skipped + 1; end if;

    if p_channel_in_app then
      insert into public.notifications(user_id,title,body,type,metadata)
      values(
        r.user_id,p_title,p_body,'broadcast',
        jsonb_build_object(
          'source','admin_broadcast',
          'broadcast_id',b_id::text,
          'priority',p_priority,
          'action_url',coalesce(p_action_url,'/dashboard/notifications')
        )
      )
      returning id into n_id;
    else
      n_id := null;
    end if;

    insert into public.zynth_broadcast_recipients(
      broadcast_id,user_id,notification_id,push_state,push_status
    ) values(
      b_id,r.user_id,n_id,
      case when p_channel_push then state else 'not_requested' end,
      case when p_channel_push and state='enabled' then 'queued'
           when p_channel_push then 'skipped'
           else 'not_requested' end
    );
  end loop;

  update public.zynth_broadcasts
  set status='sent',
      recipient_count=total,
      push_eligible_count=push_eligible,
      push_skipped_count=push_skipped,
      sent_at=now()
  where id=b_id;

  return jsonb_build_object(
    'id',b_id,
    'recipient_count',total,
    'push_eligible_count',push_eligible,
    'push_skipped_count',push_skipped
  );
exception when others then
  if b_id is not null then
    update public.zynth_broadcasts set status='failed' where id=b_id;
  end if;
  raise;
end
$$;

create or replace function public.zynth_record_broadcast_push_result(
  p_notification_id uuid,
  p_secret text,
  p_delivered integer,
  p_failed integer,
  p_revoked integer
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  worker_secret text;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name='zynth_push_worker_secret'
  limit 1;
  if worker_secret is null or p_secret is null or worker_secret<>p_secret then raise exception 'INVALID_PUSH_SECRET'; end if;

  update public.zynth_broadcast_recipients
  set push_status=case when coalesce(p_delivered,0)>0 then 'sent' else 'failed' end,
      push_delivered_at=case when coalesce(p_delivered,0)>0 then now() else push_delivered_at end,
      push_failed_at=case when coalesce(p_failed,0)>0 then now() else push_failed_at end,
      failure_reason=case when coalesce(p_failed,0)>0 then 'Web Push delivery failed' else failure_reason end
  where notification_id=p_notification_id;

  update public.zynth_broadcasts b
  set push_sent_count=(select count(*) from public.zynth_broadcast_recipients r where r.broadcast_id=b.id and r.push_status='sent'),
      push_failed_count=(select count(*) from public.zynth_broadcast_recipients r where r.broadcast_id=b.id and r.push_status='failed')
  where id=(select broadcast_id from public.zynth_broadcast_recipients where notification_id=p_notification_id limit 1);

  return true;
end
$$;

revoke all on function public.zynth_broadcast_candidates(jsonb) from public,anon,authenticated;
revoke all on function public.zynth_admin_broadcast_preview(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.zynth_admin_broadcast_recipients(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.zynth_admin_create_broadcast(uuid,text,text,jsonb,boolean,boolean,text,text) from public,anon,authenticated;
revoke all on function public.zynth_record_broadcast_push_result(uuid,text,integer,integer,integer) from public,anon,authenticated;

grant execute on function public.zynth_broadcast_candidates(jsonb) to postgres;
grant execute on function public.zynth_admin_broadcast_preview(uuid,jsonb) to authenticated;
grant execute on function public.zynth_admin_broadcast_recipients(uuid,jsonb) to authenticated;
grant execute on function public.zynth_admin_create_broadcast(uuid,text,text,jsonb,boolean,boolean,text,text) to authenticated;
grant execute on function public.zynth_record_broadcast_push_result(uuid,text,integer,integer,integer) to public;

create or replace function public.zynth_admin_broadcast_history(p_admin_id uuid)
returns table(
 id uuid,title text,body text,audience jsonb,priority text,status text,recipient_count integer,
 push_eligible_count integer,push_sent_count integer,push_failed_count integer,push_skipped_count integer,
 created_at timestamptz,sent_at timestamptz,created_by uuid
)
language plpgsql
security definer
set search_path to ''
as $$
begin
 if not public.zynth_has_role(auth.uid(),'admin')
    or not exists(select 1 from public.users where id=auth.uid() and account_status='active')
 then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return query
 select b.id,b.title,b.body,b.audience,b.priority,b.status,b.recipient_count,b.push_eligible_count,b.push_sent_count,
        b.push_failed_count,b.push_skipped_count,b.created_at,b.sent_at,b.created_by
 from public.zynth_broadcasts b
 order by b.created_at desc
 limit 100;
end
$$;
revoke all on function public.zynth_admin_broadcast_history(uuid) from public,anon,authenticated;
grant execute on function public.zynth_admin_broadcast_history(uuid) to authenticated;
