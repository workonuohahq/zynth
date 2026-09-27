create table if not exists public.zynth_pwa_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists zynth_pwa_devices_user_id_idx on public.zynth_pwa_devices(user_id);
create index if not exists zynth_pwa_devices_active_idx on public.zynth_pwa_devices(user_id) where revoked_at is null;

alter table public.zynth_pwa_devices enable row level security;

revoke all on table public.zynth_pwa_devices from anon;
grant select, insert, update on table public.zynth_pwa_devices to authenticated;

drop policy if exists "PWA devices are readable by owner" on public.zynth_pwa_devices;
create policy "PWA devices are readable by owner" on public.zynth_pwa_devices
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "PWA devices are insertable by owner" on public.zynth_pwa_devices;
create policy "PWA devices are insertable by owner" on public.zynth_pwa_devices
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "PWA devices are revocable by owner" on public.zynth_pwa_devices;
create policy "PWA devices are revocable by owner" on public.zynth_pwa_devices
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
