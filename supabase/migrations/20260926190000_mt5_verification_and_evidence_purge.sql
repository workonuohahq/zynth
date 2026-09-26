-- MT5 trader verification and evidence-link purge
create table if not exists public.zynth_trader_mt5_credentials (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 mt5_login text not null,
 mt5_server text not null,
 investor_password_ciphertext text not null,
 status text not null default 'pending' check(status in('pending','verified','rejected')),
 submitted_at timestamptz not null default now(),
 verified_at timestamptz,
 verified_by uuid references public.users(id),
 rejection_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id)
);
create index if not exists idx_zynth_trader_mt5_status on public.zynth_trader_mt5_credentials(status);
create index if not exists idx_zynth_trader_mt5_user on public.zynth_trader_mt5_credentials(user_id);
alter table public.zynth_trader_mt5_credentials enable row level security;
grant select,insert,update on public.zynth_trader_mt5_credentials to authenticated;
create policy if not exists "trader mt5 own select" on public.zynth_trader_mt5_credentials for select to authenticated using((select auth.uid())=user_id);
create policy if not exists "trader mt5 own insert" on public.zynth_trader_mt5_credentials for insert to authenticated with check((select auth.uid())=user_id);
create policy if not exists "trader mt5 own update" on public.zynth_trader_mt5_credentials for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy if not exists "admin mt5 select" on public.zynth_trader_mt5_credentials for select to authenticated using(exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active'));
create policy if not exists "admin mt5 update" on public.zynth_trader_mt5_credentials for update to authenticated using(exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active')) with check(exists(select 1 from public.users u where u.id=(select auth.uid()) and u.role='admin' and u.account_status='active'));
alter table public.zynth_trader_applications drop column if exists evidence_url;
alter table public.zynth_daily_reports drop column if exists evidence_url;
alter table public.system_settings drop column if exists require_settlement_evidence;
-- The report submission RPC now requires a verified MT5 credential before accepting reports.
-- Admin settings no longer expose or persist an evidence requirement.
