-- Fix withdrawal PIN status detection.
-- A PostgreSQL composite record can evaluate as NULL when nullable fields are NULL,
-- even when the underlying row exists. Use explicit row existence instead.

create or replace function public.zynth_withdrawal_pin_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  configured boolean := false;
  locked_at timestamptz;
  failures integer := 0;
  changed_at timestamptz;
begin
  if uid is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select exists(
    select 1
    from public.zynth_withdrawal_pins
    where user_id = uid
  ) into configured;

  if configured then
    select locked_until, failed_attempts, last_changed_at
    into locked_at, failures, changed_at
    from public.zynth_withdrawal_pins
    where user_id = uid;
  end if;

  return jsonb_build_object(
    'configured', configured,
    'locked_until', locked_at,
    'failed_attempts', coalesce(failures, 0),
    'last_changed_at', changed_at
  );
end;
$function$;