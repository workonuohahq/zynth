-- Make normal referral rewards self-settling after the configured review window,
-- and ensure a redemption during a ZPA qualification period disqualifies that acquisition.
-- All wallet credits and ledger updates are atomic and row-locked.

create or replace function public.zynth_process_referral_rewards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r record;
  u public.users%rowtype;
  wait_hours integer;
  v_tx uuid;
  v_ref text;
  v_count integer := 0;
  v_total numeric := 0;
begin
  select coalesce(pending_period_hours,24)
    into wait_hours
  from public.zynth_referral_settings
  where id = '00000000-0000-0000-0000-000000000001';

  wait_hours := greatest(coalesce(wait_hours,24),0);

  for r in
    select rr.*
    from public.zynth_referral_rewards rr
    where rr.status = 'pending'
      and rr.created_at <= now() - make_interval(hours => wait_hours)
    order by rr.created_at
    for update skip locked
  loop
    -- Lock the recipient before changing their balance. The reward row lock
    -- plus the credited status makes this safe to run repeatedly/concurrently.
    select * into u
    from public.users
    where id = r.referrer_id
    for update;

    if not found then
      update public.zynth_referral_rewards
      set status = 'rejected',
          rejection_reason = coalesce(rejection_reason,'Referrer account no longer exists')
      where id = r.id;
      continue;
    end if;

    v_ref := 'REF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));

    update public.users
    set main_wallet_balance = main_wallet_balance + r.reward_amount,
        updated_at = now()
    where id = r.referrer_id;

    insert into public.transactions(
      user_id,type,amount,status,reference,metadata,processed_at
    )
    values(
      r.referrer_id,
      'referral_reward',
      r.reward_amount,
      'completed',
      v_ref,
      jsonb_build_object(
        'referral_reward_id',r.id,
        'referral_id',r.referral_id,
        'referred_user_id',r.referred_user_id,
        'source_investment_id',r.source_investment_id,
        'processor','zynth_process_referral_rewards'
      ),
      now()
    )
    returning id into v_tx;

    update public.zynth_referral_rewards
    set status = 'credited',
        approved_at = coalesce(approved_at,now()),
        credited_at = now(),
        credited_transaction_id = v_tx
    where id = r.id
      and status = 'pending';

    -- The row is locked, so the guarded update should always affect one row.
    if found then
      update public.zynth_referrals
      set status = 'rewarded', updated_at = now()
      where id = r.referral_id;

      insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
      values(
        r.referrer_id,
        'referral.reward_credited_automatically',
        'referral_reward',
        r.id,
        jsonb_build_object('amount',r.reward_amount,'transaction_id',v_tx,'reference',v_ref)
      );

      perform public.zynth_emit_notification(
        r.referrer_id,
        'referral.reward_credited',
        jsonb_build_object('reward_amount',r.reward_amount,'referred_user_id',r.referred_user_id,'reference',v_ref),
        'Referral reward credited',
        'Your referral reward has been credited to your available balance.',
        'success'
      );

      v_count := v_count + 1;
      v_total := v_total + r.reward_amount;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'credited_count',v_count,'credited_amount',v_total);
end
$function$;

revoke all on function public.zynth_process_referral_rewards() from public, anon, authenticated;
grant execute on function public.zynth_process_referral_rewards() to service_role;

-- Keep referral payouts on the same simple, existing pg_cron infrastructure as ZPA.
do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'zynth-referral-reward-processor'
  limit 1;

  if v_job_id is null then
    perform cron.schedule(
      'zynth-referral-reward-processor',
      '*/15 * * * *',
      'select public.zynth_process_referral_rewards();'
    );
  else
    perform cron.unschedule(v_job_id);
    perform cron.schedule(
      'zynth-referral-reward-processor',
      '*/15 * * * *',
      'select public.zynth_process_referral_rewards();'
    );
  end if;
end
$schedule$;

-- If a qualifying ZPA investor redeems/exits the first investment before the
-- qualification completes, fail the acquisition and its still-unpaid incentive.
create or replace function public.zynth_fail_zpa_qualification_on_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  a record;
begin
  if new.event_type <> 'redeemed' then
    return new;
  end if;

  for a in
    select id
    from public.zynth_zpa_acquisitions
    where first_investment_id = new.investment_id
      and status = 'qualifying'
      and qualifying_started_at is not null
      and new.created_at >= qualifying_started_at
      and qualification_due_at is not null
      and new.created_at < qualification_due_at
    for update
  loop
    update public.zynth_zpa_acquisitions
    set status = 'failed',
        failure_reason = 'First investment was redeemed during the qualification period.',
        updated_at = now()
    where id = a.id
      and status = 'qualifying';

    update public.zynth_zpa_earnings
    set status = 'failed',
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'failure_reason','First investment was redeemed during the qualification period.',
          'redemption_event_id',new.id
        )
    where acquisition_id = a.id
      and earning_type = 'capital_incentive'
      and status = 'qualifying';
  end loop;

  return new;
end
$function$;

revoke all on function public.zynth_fail_zpa_qualification_on_redemption() from public, anon, authenticated, service_role;

drop trigger if exists trg_zynth_fail_zpa_qualification_on_redemption on public.zynth_investment_events;
create trigger trg_zynth_fail_zpa_qualification_on_redemption
after insert on public.zynth_investment_events
for each row
when (new.event_type = 'redeemed')
execute function public.zynth_fail_zpa_qualification_on_redemption();
