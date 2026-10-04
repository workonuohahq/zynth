-- Phase 4: KYC / AML foundation
create table if not exists public.zynth_kyc_profiles (
 user_id uuid primary key references public.users(id) on delete cascade,
 status text not null default 'NOT_STARTED' check(status in ('NOT_STARTED','PENDING','IN_REVIEW','VERIFIED','REJECTED','EXPIRED','REVERIFICATION_REQUIRED','SUSPENDED')),
 verification_level text not null default 'NONE' check(verification_level in ('NONE','BASIC','STANDARD','ENHANCED')),
 legal_first_name text, legal_middle_name text, legal_last_name text, date_of_birth date, nationality text, country_of_residence text, tax_residency text,
 source_of_funds text, source_of_funds_status text not null default 'NOT_REQUIRED' check(source_of_funds_status in ('NOT_REQUIRED','PENDING','VERIFIED','REJECTED')),
 source_of_wealth text, source_of_wealth_status text not null default 'NOT_REQUIRED' check(source_of_wealth_status in ('NOT_REQUIRED','PENDING','VERIFIED','REJECTED')),
 risk_classification text not null default 'LOW' check(risk_classification in ('LOW','MEDIUM','HIGH','CRITICAL')), risk_reason text, risk_reviewed_at timestamptz,
 next_review_due_at timestamptz, verified_at timestamptz, expires_at timestamptz, suspended_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.zynth_kyc_documents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 document_type text not null, issuing_country text, document_reference text, verification_provider text,
 verification_status text not null default 'PENDING' check(verification_status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED','EXPIRED')),
 submitted_at timestamptz not null default now(), verified_at timestamptz, expiration_date date, reviewer_user_id uuid references public.users(id),
 rejection_reason text, evidence_reference text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.zynth_kyc_addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 address_type text not null default 'RESIDENTIAL', line1 text not null, line2 text, city text, state_region text, postal_code text, country text not null,
 verification_method text, status text not null default 'PENDING' check(status in ('PENDING','IN_REVIEW','VERIFIED','REJECTED','EXPIRED')),
 verification_date timestamptz, evidence_reference text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.zynth_kyc_screenings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 screening_type text not null check(screening_type in ('PEP','SANCTIONS')), screened boolean not null default false,
 result text not null default 'NOT_SCREENED', provider text, screened_at timestamptz,
 review_status text not null default 'NOT_REVIEWED', reviewer_user_id uuid references public.users(id), review_notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.zynth_kyc_review_history (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade, reviewer_user_id uuid references public.users(id),
 action text not null, from_status text, to_status text, from_risk_classification text, to_risk_classification text, reason text, notes text,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists idx_zynth_kyc_documents_user on public.zynth_kyc_documents(user_id,created_at desc);
create index if not exists idx_zynth_kyc_addresses_user on public.zynth_kyc_addresses(user_id,created_at desc);
create index if not exists idx_zynth_kyc_screenings_user on public.zynth_kyc_screenings(user_id,screening_type,created_at desc);
create index if not exists idx_zynth_kyc_history_user on public.zynth_kyc_review_history(user_id,created_at desc);
alter table public.zynth_kyc_profiles enable row level security; alter table public.zynth_kyc_documents enable row level security; alter table public.zynth_kyc_addresses enable row level security; alter table public.zynth_kyc_screenings enable row level security; alter table public.zynth_kyc_review_history enable row level security;
revoke all on public.zynth_kyc_profiles,public.zynth_kyc_documents,public.zynth_kyc_addresses,public.zynth_kyc_screenings,public.zynth_kyc_review_history from anon,authenticated,public;
grant all on public.zynth_kyc_profiles,public.zynth_kyc_documents,public.zynth_kyc_addresses,public.zynth_kyc_screenings,public.zynth_kyc_review_history to service_role;

-- All KYC reads/writes are server-authoritative SECURITY DEFINER RPCs with auth.uid()/admin checks.
-- See the live Phase 4 functions: zynth_kyc_profile, zynth_kyc_submit_profile, zynth_kyc_submit_document,
-- zynth_kyc_admin_list, zynth_kyc_admin_detail, zynth_kyc_admin_update, zynth_kyc_admin_document and zynth_kyc_admin_screening.
-- Existing boolean KYC state is migrated into the profile during rollout:
insert into public.zynth_kyc_profiles(user_id,status,verification_level,verified_at)
select id,case when coalesce(kyc_verified,false) then 'VERIFIED' else 'NOT_STARTED' end,
       case when coalesce(kyc_verified,false) then 'STANDARD' else 'NONE' end,
       case when coalesce(kyc_verified,false) then now() else null end
from public.users on conflict(user_id) do nothing;
