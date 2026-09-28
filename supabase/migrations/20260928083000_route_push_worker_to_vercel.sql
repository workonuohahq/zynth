-- Route ZYNTH push delivery and minute recovery through Vercel.
create or replace function public.zynth_enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  insert into public.zynth_push_jobs(notification_id,user_id)
  values(new.id,new.user_id)
  on conflict(notification_id) do nothing;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='zynth_push_worker_secret'
  limit 1;

  if v_secret is not null then
    perform net.http_post(
      url := 'https://zynthhq.vercel.app/api/internal/push/process',
      body := jsonb_build_object('notification_id',new.id),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-zynth-push-secret',v_secret
      ),
      timeout_milliseconds := 15000
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_zynth_enqueue_notification_push on public.notifications;
create trigger trg_zynth_enqueue_notification_push
after insert on public.notifications
for each row execute function public.zynth_enqueue_notification_push();

select cron.unschedule('zynth-push-worker')
where exists (select 1 from cron.job where jobname='zynth-push-worker');

select cron.schedule(
  'zynth-push-worker',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://zynthhq.vercel.app/api/internal/push/process',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-zynth-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='zynth_push_worker_secret' limit 1)
      ),
      timeout_milliseconds := 15000
    );
  $cron$
);