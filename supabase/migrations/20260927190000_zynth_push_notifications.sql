create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.zynth_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, endpoint)
);
create index if not exists idx_zynth_push_subscriptions_user_active on public.zynth_push_subscriptions(user_id) where revoked_at is null;
alter table public.zynth_push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.zynth_push_subscriptions;\ncreate policy "Users manage own push subscriptions" on public.zynth_push_subscriptions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create table if not exists public.zynth_push_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(notification_id)
);
create index if not exists idx_zynth_push_jobs_pending on public.zynth_push_jobs(status,available_at,created_at) where status in ('pending','processing');
alter table public.zynth_push_jobs enable row level security;

create or replace function public.zynth_enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_secret text;
begin
  insert into public.zynth_push_jobs(notification_id,user_id) values(new.id,new.user_id) on conflict(notification_id) do nothing;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='zynth_push_worker_secret' limit 1;
  if v_secret is not null then
    perform net.http_post(
      url := 'https://zynth-lywd.onrender.com/api/internal/push/process',
      body := jsonb_build_object('notification_id',new.id),
      headers := jsonb_build_object('Content-Type','application/json','x-zynth-push-secret',v_secret),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$;
drop trigger if exists trg_zynth_enqueue_notification_push on public.notifications;
create trigger trg_zynth_enqueue_notification_push after insert on public.notifications for each row execute function public.zynth_enqueue_notification_push();

create table if not exists public.zynth_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  money boolean not null default true,
  investments boolean not null default true,
  security boolean not null default true,
  system boolean not null default true,
  trader boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.zynth_notification_preferences enable row level security;
drop policy if exists "Users manage own notification preferences" on public.zynth_notification_preferences;\ncreate policy "Users manage own notification preferences" on public.zynth_notification_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

revoke all on public.zynth_push_jobs from anon,authenticated;
grant select,insert,update,delete on public.zynth_push_subscriptions to authenticated;
grant select,insert,update on public.zynth_notification_preferences to authenticated;

create or replace function public.zynth_claim_push_jobs(p_limit integer default 25) returns setof public.zynth_push_jobs language plpgsql security definer set search_path=public as $$
begin
  return query
  update public.zynth_push_jobs j
  set status='processing',locked_at=now(),attempts=j.attempts+1
  where j.id in(
    select id from public.zynth_push_jobs
    where(status='pending' and available_at<=now()) or(status='processing' and locked_at<now()-interval '5 minutes')
    order by created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  returning j.*;
end;
$$;
revoke all on function public.zynth_claim_push_jobs(integer) from public,anon,authenticated;
grant execute on function public.zynth_claim_push_jobs(integer) to service_role;

create or replace function public.zynth_complete_push_job(p_id uuid,p_status text,p_error text default null,p_delay_seconds integer default 0) returns void language sql security definer set search_path=public as $$
update public.zynth_push_jobs
set status=case when p_status='sent' then 'sent' else 'pending' end,
    sent_at=case when p_status='sent' then now() else sent_at end,
    last_error=p_error,
    available_at=case when p_status='sent' then available_at else now()+make_interval(secs=>greatest(5,least(p_delay_seconds,3600))) end,
    locked_at=null
where id=p_id;
$$;
revoke all on function public.zynth_complete_push_job(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.zynth_complete_push_job(uuid,text,text,integer) to service_role;


create or replace function public.zynth_push_secret_valid(p_secret text)
returns boolean
language sql
security definer
set search_path=public
as $$
select exists(select 1 from vault.decrypted_secrets where name='zynth_push_worker_secret' and decrypted_secret=p_secret);
$$;
revoke all on function public.zynth_push_secret_valid(text) from public,anon,authenticated;
grant execute on function public.zynth_push_secret_valid(text) to anon,authenticated,service_role;

create or replace function public.zynth_claim_push_jobs(p_limit integer default 25,p_secret text default null)
returns setof public.zynth_push_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.zynth_push_secret_valid(p_secret) then raise exception 'Unauthorized'; end if;
  return query
  update public.zynth_push_jobs j
  set status='processing',locked_at=now(),attempts=j.attempts+1
  where j.id in(
    select id from public.zynth_push_jobs
    where(status='pending' and available_at<=now()) or(status='processing' and locked_at<now()-interval '5 minutes')
    order by created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  returning j.*;
end;
$$;
revoke all on function public.zynth_claim_push_jobs(integer,text) from public,authenticated;
grant execute on function public.zynth_claim_push_jobs(integer,text) to anon,authenticated,service_role;

create or replace function public.zynth_get_push_job_context(p_job_id uuid,p_secret text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_job public.zynth_push_jobs; v_notice jsonb; v_preferences jsonb; v_subscriptions jsonb;
begin
  if not public.zynth_push_secret_valid(p_secret) then raise exception 'Unauthorized'; end if;
  select * into v_job from public.zynth_push_jobs where id=p_job_id;
  if v_job.id is null then return null; end if;
  select to_jsonb(n) into v_notice from public.notifications n where n.id=v_job.notification_id;
  select coalesce(to_jsonb(p),'{}'::jsonb) into v_preferences from public.zynth_notification_preferences p where p.user_id=v_job.user_id;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_subscriptions from public.zynth_push_subscriptions s where s.user_id=v_job.user_id and s.revoked_at is null;
  return jsonb_build_object('job',to_jsonb(v_job),'notification',v_notice,'preferences',v_preferences,'subscriptions',v_subscriptions);
end;
$$;
revoke all on function public.zynth_get_push_job_context(uuid,text) from public,authenticated;
grant execute on function public.zynth_get_push_job_context(uuid,text) to anon,authenticated,service_role;

create or replace function public.zynth_complete_push_job(p_id uuid,p_status text,p_error text default null,p_delay_seconds integer default 0,p_secret text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.zynth_push_secret_valid(p_secret) then raise exception 'Unauthorized'; end if;
  update public.zynth_push_jobs
  set status=case when p_status='sent' then 'sent' else 'pending' end,
      sent_at=case when p_status='sent' then now() else sent_at end,
      last_error=p_error,
      available_at=case when p_status='sent' then available_at else now()+make_interval(secs=>greatest(5,least(p_delay_seconds,3600))) end,
      locked_at=null
  where id=p_id;
end;
$$;
revoke all on function public.zynth_complete_push_job(uuid,text,text,integer) from public,authenticated;
grant execute on function public.zynth_complete_push_job(uuid,text,text,integer,text) to anon,authenticated,service_role;
