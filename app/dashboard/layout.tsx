import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import NotificationBell from "@/components/notification-bell";
import ThemeSwitcher from "@/components/theme-switcher";
import SupportLauncher from "@/components/support-launcher";
import PwaAccessGate from "@/components/pwa-access-gate";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: roleKeys }] = await Promise.all([
    supabase.from("users").select("account_status").eq("id", user.id).single(),
    supabase.rpc("zynth_get_my_roles", { p_user_id: user.id })
  ]);
  if(profile?.account_status==="suspended" || profile?.account_status==="deactivated") redirect("/account-disabled");
  const roles=Array.isArray(roleKeys)?roleKeys:[];
  const privileged=roles.some((r:any)=>r==="admin"||r==="trader"||r?.role_key==="admin"||r?.role_key==="trader");
  const content=<div className="dashboard-frame"><DashboardNav roles={roles} /><NotificationBell /><ThemeSwitcher /><SupportLauncher /><main className="dashboard-main">{children}</main></div>;
  return privileged ? content : <PwaAccessGate>{content}</PwaAccessGate>;
}