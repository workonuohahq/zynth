import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import NotificationBell from "@/components/notification-bell";
import ThemeSwitcher from "@/components/theme-switcher";
import SupportLauncher from "@/components/support-launcher";
import PwaWorkspaceGate from "@/components/pwa-workspace-gate";
import PwaFetchBridge from "@/components/pwa-fetch-bridge";
import PushNotificationManager from "@/components/push-notification-manager";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: roleKeys }] = await Promise.all([
    supabase.from("users").select("account_status").eq("id", user.id).single(),
    supabase.rpc("zynth_get_my_roles", { p_user_id: user.id })
  ]);

  if (profile?.account_status === "suspended" || profile?.account_status === "deactivated") {
    redirect("/account-disabled");
  }

  const roles = Array.isArray(roleKeys) ? roleKeys : [];
  return (
    <PwaWorkspaceGate>
      <PwaFetchBridge />
      <PushNotificationManager />
      <div className="dashboard-frame">
        <DashboardNav roles={roles} />
        <NotificationBell />
        <ThemeSwitcher />
        <SupportLauncher />
        <main className="dashboard-main">{children}</main>
      </div>
    </PwaWorkspaceGate>
  );
}
