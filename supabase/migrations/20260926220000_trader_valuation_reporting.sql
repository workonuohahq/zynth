-- Trader valuation reporting: time window, one report per cycle, and realized/unrealized P&L.
alter table public.system_settings
  add column if not exists trader_report_start_time time without time zone not null default '06:00:00',
  add column if not exists trader_report_end_time time without time zone not null default '23:00:00';

alter table public.zynth_daily_reports
  add column if not exists realized_pnl numeric not null default 0,
  add column if not exists unrealized_pnl numeric not null default 0,
  add column if not exists prior_unrealized_pnl numeric not null default 0,
  add column if not exists report_cycle_date date;

update public.zynth_daily_reports
set realized_pnl=coalesce(realized_pnl,trading_pnl),
    unrealized_pnl=coalesce(unrealized_pnl,0),
    prior_unrealized_pnl=coalesce(prior_unrealized_pnl,0),
    report_cycle_date=coalesce(report_cycle_date,report_date)
where report_cycle_date is null;

create index if not exists zynth_daily_reports_cycle_idx
on public.zynth_daily_reports(strategy_id,report_cycle_date,status);

alter table public.zynth_investments
add column if not exists unrealized_pnl numeric not null default 0;

-- The production database function definitions are maintained in the deployment migration.
-- This migration file intentionally contains the schema layer; function definitions are
-- deployed alongside the application migration to keep the accounting engine atomic.
