-- PHASE 9/10/11 — Referral Economics, ZPA Fraud Intelligence & Risk/Compliance Center
-- Production reconciliation migration.
-- The authoritative function bodies are maintained in the Supabase production migration history;
-- this file records the schema/index/security invariants so the repository does not drift.

alter table public.zynth_referral_settings
  add column if not exists retention_days integer not null default 10
  check (retention_days between 1 and 365);

create index if not exists zynth_referrals_referrer_status_idx
  on public.zynth_referrals(referrer_id,status,created_at desc);
create index if not exists zynth_referrals_referred_idx
  on public.zynth_referrals(referred_user_id);
create index if not exists zynth_referral_rewards_referrer_status_idx
  on public.zynth_referral_rewards(referrer_id,status,created_at desc);
create index if not exists zynth_risk_events_user_rule_time_idx
  on public.zynth_risk_events(user_id,rule_key,occurred_at desc);
create index if not exists zynth_risk_cases_class_status_time_idx
  on public.zynth_risk_cases(classification,status,opened_at desc);
create index if not exists zynth_security_devices_user_hash_idx
  on public.zynth_security_devices(user_id,device_key_hash)
  where revoked_at is null;
create index if not exists zynth_crypto_payments_address_idx
  on public.zynth_crypto_payments(pay_address)
  where pay_address is not null;

-- Never allow clients to submit arbitrary referral/risk points.
revoke all on function public.zynth_risk_record_event(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.zynth_risk_record_system_event(uuid,text,text,text,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.zynth_risk_record_system_event(uuid,text,text,text,text,text,uuid,text,jsonb) to service_role;

-- Admin-only unified compliance surface.
revoke all on function public.zynth_risk_compliance_center(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.zynth_risk_compliance_center(uuid,text,integer) to authenticated;

-- User/admin referral dashboards are authenticated entry points but enforce auth.uid()
-- ownership/admin authorization inside the SECURITY DEFINER bodies.
revoke all on function public.zynth_referral_dashboard(uuid) from public,anon;
grant execute on function public.zynth_referral_dashboard(uuid) to authenticated;
revoke all on function public.zynth_admin_referral_dashboard(uuid) from public,anon;
grant execute on function public.zynth_admin_referral_dashboard(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.zynth_risk_compliance_center(uuid,text,integer)') is null then
    raise exception 'Phase 9/10/11 reconciliation: risk compliance center function missing';
  end if;
  if to_regprocedure('public.zynth_referral_dashboard(uuid)') is null then
    raise exception 'Phase 9/10/11 reconciliation: referral dashboard function missing';
  end if;
  if to_regprocedure('public.zynth_admin_referral_dashboard(uuid)') is null then
    raise exception 'Phase 9/10/11 reconciliation: admin referral dashboard function missing';
  end if;
end $$;
