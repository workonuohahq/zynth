-- ZYNTH NOWPayments crypto payment rail
-- Applied to production Supabase during the crypto rail build.

create table if not exists public.zynth_payment_provider_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('nowpayments')),
  enabled boolean not null default false,
  price_currency text not null default 'ngn',
  fixed_rate boolean not null default true,
  fee_paid_by_user boolean not null default true,
  supported_currencies jsonb not null default '["usdttrc20"]'::jsonb,
  api_key_ciphertext text,
  ipn_secret_ciphertext text,
  api_key_updated_at timestamptz,
  ipn_secret_updated_at timestamptz,
  last_test_at timestamptz,
  last_test_status text check (last_test_status is null or last_test_status in ('success','failed')),
  last_test_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zynth_crypto_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  deposit_id uuid not null unique references public.deposit_requests(id),
  nowpayments_payment_id text unique,
  order_id text not null unique,
  price_amount numeric(24,8) not null check (price_amount > 0),
  price_currency text not null default 'ngn',
  pay_amount numeric(36,18),
  pay_currency text not null,
  pay_address text,
  payment_status text not null default 'created',
  actually_paid numeric(36,18),
  actually_paid_currency text,
  transaction_hash text,
  provider_fee numeric(36,18),
  expiration_at timestamptz,
  credited_at timestamptz,
  last_ipn_at timestamptz,
  last_ipn_payload jsonb,
  provider_payload jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.zynth_payment_provider_settings(provider)
values ('nowpayments')
on conflict (provider) do nothing;

alter table public.zynth_payment_provider_settings enable row level security;
alter table public.zynth_crypto_payments enable row level security;

drop policy if exists "admins_manage_payment_provider_settings" on public.zynth_payment_provider_settings;
create policy "admins_manage_payment_provider_settings" on public.zynth_payment_provider_settings for all to authenticated
using ((select public.zynth_has_role(auth.uid(),'admin')))
with check ((select public.zynth_has_role(auth.uid(),'admin')));

drop policy if exists "users_view_own_crypto_payments" on public.zynth_crypto_payments;
create policy "users_view_own_crypto_payments" on public.zynth_crypto_payments for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "admins_view_crypto_payments" on public.zynth_crypto_payments;
create policy "admins_view_crypto_payments" on public.zynth_crypto_payments for select to authenticated
using ((select public.zynth_has_role(auth.uid(),'admin')));

create index if not exists zynth_crypto_payments_user_idx on public.zynth_crypto_payments(user_id,created_at desc);
create index if not exists zynth_crypto_payments_status_idx on public.zynth_crypto_payments(payment_status,created_at desc);

-- The three functions below are intentionally restricted. The public-facing webhook
-- uses service_role server credentials after verifying the NOWPayments HMAC signature.

revoke execute on function public.zynth_finalize_crypto_deposit_request(uuid) from public, anon, authenticated;
revoke execute on function public.zynth_finalize_crypto_payment(text,text,numeric,text,text,numeric,jsonb) from public, anon, authenticated;
