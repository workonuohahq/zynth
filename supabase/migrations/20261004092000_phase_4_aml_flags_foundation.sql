-- Phase 4 AML flag foundation
create table if not exists public.zynth_aml_flags (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 flag_type text not null, severity text not null default 'MEDIUM', status text not null default 'OPEN',
 source text, description text, transaction_id uuid, metadata jsonb not null default '{}'::jsonb,
 detected_at timestamptz not null default now(), reviewed_at timestamptz, reviewer_user_id uuid references public.users(id), resolution_note text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_zynth_aml_flags_user on public.zynth_aml_flags(user_id,created_at desc);
create index if not exists idx_zynth_aml_flags_open on public.zynth_aml_flags(status,severity,detected_at desc);
alter table public.zynth_aml_flags enable row level security;
revoke all on public.zynth_aml_flags from anon,authenticated,public;
grant all on public.zynth_aml_flags to service_role;
-- Live RPCs provide admin-only flag listing, creation and resolution:
-- zynth_kyc_admin_flags, zynth_aml_admin_flag, zynth_aml_admin_resolve.
