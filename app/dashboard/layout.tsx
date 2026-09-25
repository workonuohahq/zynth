import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import NotificationBell from "@/components/notification-bell";
import ThemeSwitcher from "@/components/theme-switcher";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("account_status").eq("id",user.id).single();
  if(profile?.account_status==="suspended" || profile?.account_status==="deactivated") redirect("/account-disabled");
  return <div className="dashboard-frame"><DashboardNav /><NotificationBell /><ThemeSwitcher /><main className="dashboard-main">{children}</main></div>;
}