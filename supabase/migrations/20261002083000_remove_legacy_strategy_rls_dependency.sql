-- Remove the legacy strategy RLS policy that referenced zynth_has_role().
-- It could still be planned/evaluated by Postgres and break embedded strategy reads
-- after role-function hardening. Public strategy visibility only needs active rows.
drop policy if exists "strategies_select_trader_or_admin_or_active" on public.zynth_strategies;

-- Keep explicit investor-owned read policies reproducible.
drop policy if exists "zynth_investments_select_own" on public.zynth_investments;
create policy "zynth_investments_select_own" on public.zynth_investments
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "zynth_strategies_select_active" on public.zynth_strategies;
create policy "zynth_strategies_select_active" on public.zynth_strategies
for select to authenticated
using (status='active');

drop policy if exists "zynth_redemptions_select_own" on public.zynth_redemption_requests;
create policy "zynth_redemptions_select_own" on public.zynth_redemption_requests
for select to authenticated
using ((select auth.uid()) = user_id);
