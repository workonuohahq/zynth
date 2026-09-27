-- Normalize Trader-related RLS to the multi-role authorization model.
-- Applied to production on 2026-09-27.

DROP POLICY IF EXISTS "Users can view published strategies and owners can view their own" ON public.zynth_strategies;
CREATE POLICY "strategies_select_trader_or_admin_or_active"
ON public.zynth_strategies FOR SELECT TO authenticated
USING (
  status = 'active'
  OR trader_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
);

DROP POLICY IF EXISTS zynth_reports_trader_read ON public.zynth_daily_reports;
CREATE POLICY "reports_select_trader_or_admin"
ON public.zynth_daily_reports FOR SELECT TO authenticated
USING (
  trader_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
);

DROP POLICY IF EXISTS "admin mt5 select" ON public.zynth_trader_mt5_credentials;
DROP POLICY IF EXISTS "trader mt5 own select" ON public.zynth_trader_mt5_credentials;
CREATE POLICY "mt5_select_owner_or_admin"
ON public.zynth_trader_mt5_credentials FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
);

DROP POLICY IF EXISTS "admin mt5 update" ON public.zynth_trader_mt5_credentials;
DROP POLICY IF EXISTS "trader mt5 own update" ON public.zynth_trader_mt5_credentials;
CREATE POLICY "mt5_update_owner_or_admin"
ON public.zynth_trader_mt5_credentials FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
);

DROP POLICY IF EXISTS trader_profile_self_select ON public.zynth_trader_profiles;
DROP POLICY IF EXISTS trader_profiles_admin_select ON public.zynth_trader_profiles;
CREATE POLICY "trader_profiles_select_owner_or_admin"
ON public.zynth_trader_profiles FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
);

DROP POLICY IF EXISTS trader_app_self_select ON public.zynth_trader_applications;
DROP POLICY IF EXISTS trader_applications_admin_select ON public.zynth_trader_applications;
CREATE POLICY "trader_applications_select_owner_or_admin"
ON public.zynth_trader_applications FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR ((SELECT public.zynth_has_role((SELECT auth.uid()), 'admin'))
      AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.account_status = 'active'))
);
