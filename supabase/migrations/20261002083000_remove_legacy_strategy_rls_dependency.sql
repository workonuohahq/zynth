-- Canonicalize investor read policies after the RBAC/RLS hardening pass.
-- Keep the pre-existing owner policies for investments/redemptions, remove the
-- duplicate policies introduced during the incident, and remove the legacy
-- strategy policy that depended on the hardened zynth_has_role() helper.
drop policy if exists "strategies_select_trader_or_admin_or_active" on public.zynth_strategies;
drop policy if exists "zynth_investments_select_own" on public.zynth_investments;
drop policy if exists "zynth_redemptions_select_own" on public.zynth_redemption_requests;

drop policy if exists "zynth_strategies_select_active" on public.zynth_strategies;
create policy "zynth_strategies_select_active" on public.zynth_strategies
for select to authenticated
using ((status = 'active'));
