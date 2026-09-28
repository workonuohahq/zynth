-- Simplify ZYNTH push delivery.
-- Notifications remain durable in public.notifications.
-- Device subscriptions remain in public.zynth_push_subscriptions.
-- Each notification INSERT asynchronously invokes the single ZYNTH Web Push sender.
-- No push queue, cron worker, locking, retry state, or dispatcher is required.

select cron.unschedule(jobid)
from cron.job
where jobname='zynth-push-worker';

drop trigger if exists trg_zynth_enqueue_notification_push on public.notifications;
drop function if exists public.zynth_enqueue_notification_push();
drop function if exists public.zynth_claim_push_jobs(integer);
drop function if exists public.zynth_claim_push_jobs(integer,text);
drop function if exists public.zynth_get_push_job_context(uuid,text);
drop function if exists public.zynth_complete_push_job(uuid,text,text,integer);
drop function if exists public.zynth_complete_push_job(uuid,text,text,integer,text);
drop function if exists public.zynth_revoke_push_subscription(uuid,text);
drop function if exists public.zynth_push_secret_valid(text);
drop table if exists public.zynth_push_jobs;

create or replace function public.zynth_send_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='zynth_push_worker_secret'
  limit 1;

  if v_secret is not null then
    perform net.http_post(
      url := 'https://zynthhq.vercel.app/api/push/send',
      body := jsonb_build_object('notification_id',new.id),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-zynth-push-secret',v_secret
      ),
      timeout_milliseconds := 10000
    );
  end if;

  return new;
exception when others then
  raise warning 'ZYNTH push dispatch failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_zynth_send_notification_push on public.notifications;
create trigger trg_zynth_send_notification_push
after insert on public.notifications
for each row execute function public.zynth_send_notification_push();

revoke all on function public.zynth_send_notification_push() from public,anon,authenticated;
