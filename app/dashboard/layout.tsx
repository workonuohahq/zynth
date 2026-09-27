import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import NotificationBell from "@/components/notification-bell";
import ThemeSwitcher from "@/components/theme-switcher";
import SupportLauncher from "@/components/support-launcher";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("users").select("account_status").eq("id", user.id).single(),
    supabase.from("zynth_user_roles").select("role:zynth_roles(key)").eq("user_id", user.id).eq("is_active", true)
  ]);
  if(profile?.account_status==="suspended" || profile?.account_status==="deactivated") redirect("/account-disabled");
  const roleKeys=(roleRows||[]).map((row:any)=>row.role?.key).filter(Boolean);
  return <div className="dashboard-frame"><DashboardNav roles={roleKeys} /><NotificationBell /><ThemeSwitcher /><SupportLauncher /><main className="dashboard-main">{children}</main></div>;
}