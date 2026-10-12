-- ZYNTH Human Check and email-confirmation retirement.
-- Private challenge material is service-role-only; browser clients never receive answers.
create table if not exists public.zynth_registration_security (
  id boolean primary key default true check (id),
  human_check_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.zynth_registration_security(id,human_check_enabled)
values(true,true) on conflict(id) do nothing;
alter table public.zynth_registration_security enable row level security;
revoke all on public.zynth_registration_security from public, anon, authenticated;
grant select,insert,update,delete on public.zynth_registration_security to service_role;

create table if not exists public.zynth_human_check_challenges (
  id uuid primary key default gen_random_uuid(),
  answer text not null,
  challenge_type text not null check(challenge_type in ('pattern','match','order','text')),
  attempts integer not null default 0 check(attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  request_fingerprint text not null
);
create index if not exists zynth_human_check_challenges_expiry_idx
  on public.zynth_human_check_challenges(expires_at);
alter table public.zynth_human_check_challenges enable row level security;
revoke all on public.zynth_human_check_challenges from public, anon, authenticated;
grant select,insert,update,delete on public.zynth_human_check_challenges to service_role;

create table if not exists public.zynth_human_check_events (
  id bigint generated always as identity primary key,
  event_type text not null check(event_type in ('challenge','failed','registration')),
  fingerprint text not null,
  created_at timestamptz not null default now()
);
create index if not exists zynth_human_check_events_lookup_idx
  on public.zynth_human_check_events(fingerprint,event_type,created_at desc);
alter table public.zynth_human_check_events enable row level security;
revoke all on public.zynth_human_check_events from public, anon, authenticated;
grant select,insert,delete on public.zynth_human_check_events to service_role;

create or replace function public.zynth_human_check_consume(p_challenge_id uuid,p_answer text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.zynth_human_check_challenges%rowtype;
begin
 select * into c from public.zynth_human_check_challenges where id=p_challenge_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 if c.request_fingerprint <> p_fingerprint then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 if c.consumed_at is not null then return jsonb_build_object('ok',false,'reason','used'); end if;
 if c.expires_at <= now() then return jsonb_build_object('ok',false,'reason','expired'); end if;
 if c.attempts >= 5 then return jsonb_build_object('ok',false,'reason','locked'); end if;
 if lower(trim(coalesce(p_answer,''))) <> lower(trim(c.answer)) then
   update public.zynth_human_check_challenges set attempts=attempts+1 where id=p_challenge_id;
   return jsonb_build_object('ok',false,'reason','wrong');
 end if;
 update public.zynth_human_check_challenges set consumed_at=now() where id=p_challenge_id and consumed_at is null;
 if not found then return jsonb_build_object('ok',false,'reason','used'); end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.zynth_human_check_consume(uuid,text,text) from public,anon,authenticated;
grant execute on function public.zynth_human_check_consume(uuid,text,text) to service_role;

-- Do not require email confirmation to attach a ZPA code to a newly created account.
create or replace function public.zynth_auth_zpa_attribution_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
 v_code := nullif(trim(coalesce(new.raw_user_meta_data ->> 'zynth_zpa_code','')),'');
 if v_code is null then return new; end if;
 if tg_op='INSERT' then
   perform public.zynth_process_zpa_auth_confirmation(new.id,v_code);
 elsif tg_op='UPDATE' and old.raw_user_meta_data is distinct from new.raw_user_meta_data then
   if nullif(trim(coalesce(old.raw_user_meta_data ->> 'zynth_zpa_code','')),'') is null then
     perform public.zynth_process_zpa_auth_confirmation(new.id,v_code);
   end if;
 end if;
 return new;
end $$;
revoke all on function public.zynth_auth_zpa_attribution_trigger() from public,anon,authenticated,service_role;
drop trigger if exists zynth_auth_zpa_attribution_on_confirm on auth.users;
create trigger zynth_auth_zpa_attribution_on_confirm
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.zynth_auth_zpa_attribution_trigger();

comment on table public.zynth_human_check_challenges is 'Server-only one-use ZYNTH Human Check challenge answers; never expose through client APIs.';
comment on table public.zynth_registration_security is 'Server-enforced registration security switches and audit metadata.';

-- Email confirmation is no longer an activation requirement. Preserve all accounts and related business data.
update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), confirmation_token = '', confirmation_sent_at = null, updated_at = now() where email_confirmed_at is null;

-- Make the admin toggle and its audit record atomic.
create or replace function public.zynth_admin_set_registration_human_check(p_admin_user_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous boolean; v_updated timestamptz;
begin
 if auth.uid() is null or auth.uid() <> p_admin_user_id or not public.zynth_has_role(auth.uid(),'admin') then
   raise exception 'ADMIN_AUTHORIZATION_REQUIRED';
 end if;
 select human_check_enabled into v_previous from public.zynth_registration_security where id=true for update;
 if not found then v_previous:=true; end if;
 insert into public.zynth_registration_security(id,human_check_enabled,updated_at,updated_by)
 values(true,p_enabled,now(),auth.uid())
 on conflict(id) do update set human_check_enabled=excluded.human_check_enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by
 returning updated_at into v_updated;
 insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata)
 values(auth.uid(),'registration.human_check_updated','registration_security',auth.uid(),
   jsonb_build_object('previous_enabled',coalesce(v_previous,true),'new_enabled',p_enabled));
 return jsonb_build_object('human_check_enabled',p_enabled,'updated_at',v_updated,'updated_by',auth.uid());
end $$;
revoke all on function public.zynth_admin_set_registration_human_check(uuid,boolean) from public,anon;
grant execute on function public.zynth_admin_set_registration_human_check(uuid,boolean) to authenticated;
