create table if not exists public.zynth_trader_rule_documents (
  id uuid primary key default gen_random_uuid(), version integer not null, title text not null default 'ZYNTH Trader Rules & Standards',
  content text not null, requires_reacknowledgement boolean not null default true, status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz, created_by uuid references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(version)
);
create unique index if not exists zynth_trader_rule_one_published on public.zynth_trader_rule_documents(status) where status='published';
create table if not exists public.zynth_trader_rule_acknowledgements (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.zynth_trader_rule_documents(id) on delete cascade,
  trader_id uuid not null references public.users(id) on delete cascade, acknowledged_at timestamptz not null default now(), unique(document_id,trader_id)
);
create table if not exists public.zynth_trader_disciplinary_actions (
  id uuid primary key default gen_random_uuid(), trader_id uuid not null references public.users(id) on delete cascade,
  action_type text not null check (action_type in ('warning','suspension','termination','reinstatement','note')), warning_number integer,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')), reason text not null, details text,
  status text not null default 'active' check (status in ('active','resolved','reversed')), issued_by uuid references public.users(id), created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references public.users(id)
);
create index if not exists zynth_trader_rule_ack_trader on public.zynth_trader_rule_acknowledgements(trader_id);
create index if not exists zynth_trader_disciplinary_trader on public.zynth_trader_disciplinary_actions(trader_id,created_at desc);
alter table public.zynth_trader_rule_documents enable row level security;
alter table public.zynth_trader_rule_acknowledgements enable row level security;
alter table public.zynth_trader_disciplinary_actions enable row level security;
drop policy if exists trader_rules_published_read on public.zynth_trader_rule_documents;
create policy trader_rules_published_read on public.zynth_trader_rule_documents for select to authenticated using (status='published' or (select zynth_has_role((select auth.uid()),'admin')));
drop policy if exists trader_rule_ack_owner_read on public.zynth_trader_rule_acknowledgements;
create policy trader_rule_ack_owner_read on public.zynth_trader_rule_acknowledgements for select to authenticated using (trader_id=(select auth.uid()) or (select zynth_has_role((select auth.uid()),'admin')));
drop policy if exists trader_rule_ack_owner_insert on public.zynth_trader_rule_acknowledgements;
create policy trader_rule_ack_owner_insert on public.zynth_trader_rule_acknowledgements for insert to authenticated with check (trader_id=(select auth.uid()) and (select zynth_has_role((select auth.uid()),'trader')));
drop policy if exists trader_discipline_owner_read on public.zynth_trader_disciplinary_actions;
create policy trader_discipline_owner_read on public.zynth_trader_disciplinary_actions for select to authenticated using (trader_id=(select auth.uid()) or (select zynth_has_role((select auth.uid()),'admin')));
revoke all on public.zynth_trader_rule_documents from anon;
revoke all on public.zynth_trader_rule_acknowledgements from anon;
revoke all on public.zynth_trader_disciplinary_actions from anon;
grant select on public.zynth_trader_rule_documents to authenticated;
grant select,insert on public.zynth_trader_rule_acknowledgements to authenticated;
grant select on public.zynth_trader_disciplinary_actions to authenticated;
