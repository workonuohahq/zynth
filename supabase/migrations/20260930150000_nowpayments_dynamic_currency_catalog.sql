-- ZYNTH: dynamic NOWPayments merchant currency catalog.
-- NOWPayments is the provider source of truth; admins only choose which currently
-- available merchant assets ZYNTH exposes to investors.

create table if not exists public.zynth_payment_currencies (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'nowpayments',
  currency_code text not null,
  symbol text,
  name text,
  network text,
  provider_available boolean not null default false,
  zynth_enabled boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, currency_code)
);

alter table public.zynth_payment_currencies enable row level security;
revoke all on table public.zynth_payment_currencies from anon, authenticated;
grant select, update on table public.zynth_payment_currencies to authenticated;
grant all on table public.zynth_payment_currencies to service_role;

drop policy if exists "admins_manage_payment_currencies" on public.zynth_payment_currencies;
create policy "admins_manage_payment_currencies"
on public.zynth_payment_currencies
for all to authenticated
using ((select zynth_has_role((select auth.uid()), 'admin')))
with check ((select zynth_has_role((select auth.uid()), 'admin')));

create index if not exists zynth_payment_currencies_provider_available_idx
  on public.zynth_payment_currencies(provider, provider_available);
create index if not exists zynth_payment_currencies_zynth_enabled_idx
  on public.zynth_payment_currencies(provider, zynth_enabled);

insert into public.zynth_payment_currencies(provider,currency_code,zynth_enabled,provider_available)
select 'nowpayments', lower(value), true, false
from public.zynth_payment_provider_settings s,
lateral jsonb_array_elements_text(coalesce(s.supported_currencies,'[]'::jsonb))
where s.provider='nowpayments'
on conflict (provider,currency_code)
do update set zynth_enabled=true, updated_at=now();

alter table public.zynth_payment_provider_settings
  add column if not exists currency_catalog_synced_at timestamptz;
