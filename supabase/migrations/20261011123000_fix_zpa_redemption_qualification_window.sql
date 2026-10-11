-- A redemption after the configured qualification deadline must not disqualify
-- an investor merely because the 15-minute processor has not run yet.
create or replace function public.zynth_fail_zpa_qualification_on_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare a record;
begin
  if new.event_type <> 'redeemed' then return new; end if;

  for a in
    select id from public.zynth_zpa_acquisitions
    where first_investment_id = new.investment_id
      and status = 'qualifying'
      and qualifying_started_at is not null
      and qualification_due_at is not null
      and new.created_at >= qualifying_started_at
      and new.created_at < qualification_due_at
    for update
  loop
    update public.zynth_zpa_acquisitions
    set status = 'failed',
        failure_reason = 'First investment was redeemed during the qualification period.',
        updated_at = now()
    where id = a.id and status = 'qualifying';

    update public.zynth_zpa_earnings
    set status = 'failed', updated_at = now(),
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