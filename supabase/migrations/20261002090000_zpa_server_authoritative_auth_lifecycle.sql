-- ZPA attribution: server-authoritative lifecycle binding.
-- The Auth confirmation event, not browser JavaScript, is the source of truth.

create table if not exists public.zynth_zpa_attribution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zpa_code text not null,
  event_type text not null,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists zynth_zpa_attribution_events_pending_idx
  on public.zynth_zpa_attribution_events(status, created_at);

alter table public.zynth_zpa_attribution_events enable row level security;
revoke all on public.zynth_zpa_attribution_events from public, anon, authenticated;
grant select, insert, update, delete on public.zynth_zpa_attribution_events to service_role;

create or replace function public.zynth_process_zpa_auth_confirmation(
  p_user_id uuid,
  p_zpa_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null or nullif(trim(p_zpa_code), '') is null then
    return;
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    v_result := public.zynth_zpa_claim_code(
      p_user_id := p_user_id,
      p_code := trim(p_zpa_code)
    );

    insert into public.zynth_zpa_attribution_events(
      user_id, zpa_code, event_type, status, processed_at
    )
    values (
      p_user_id, trim(p_zpa_code), 'email_confirmed', 'processed', now()
    );
  exception when others then
    insert into public.zynth_zpa_attribution_events(
      user_id, zpa_code, event_type, status, error_message
    )
    values (
      p_user_id, trim(p_zpa_code), 'email_confirmed', 'failed', sqlerrm
    );
  end;
end;
$$;

revoke all on function public.zynth_process_zpa_auth_confirmation(uuid,text)
  from public, anon, authenticated, service_role;

create or replace function public.zynth_auth_zpa_attribution_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  v_code := nullif(trim(coalesce(new.raw_user_meta_data ->> 'zynth_zpa_code', '')), '');

  if v_code is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.email_confirmed_at is not null then
    perform public.zynth_process_zpa_auth_confirmation(new.id, v_code);
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.email_confirmed_at is null
     and new.email_confirmed_at is not null then
    perform public.zynth_process_zpa_auth_confirmation(new.id, v_code);
  end if;

  return new;
end;
$$;

revoke all on function public.zynth_auth_zpa_attribution_trigger()
  from public, anon, authenticated, service_role;

drop trigger if exists zynth_auth_zpa_attribution_on_confirm on auth.users;

create trigger zynth_auth_zpa_attribution_on_confirm
after insert or update of email_confirmed_at on auth.users
for each row
execute function public.zynth_auth_zpa_attribution_trigger();

comment on function public.zynth_process_zpa_auth_confirmation(uuid,text)
is 'Internal-only ZPA attribution bridge invoked by auth lifecycle; never exposed through the Data API.';

comment on function public.zynth_auth_zpa_attribution_trigger()
is 'Auth lifecycle trigger: creates ZPA attribution when a user becomes email-confirmed, independent of browser/session/PWA state.';
