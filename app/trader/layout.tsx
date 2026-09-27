import {createSupabaseServerClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import NotificationBell from "@/components/notification-bell";
import ThemeSwitcher from "@/components/theme-switcher";
import TraderMt5Gate from "@/components/trader-mt5-gate";
export default async function TraderLayout({children}:{children:React.ReactNode}){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const [{data:profile},{data:roleRows}]=await Promise.all([
  s.from("users").select("account_status").eq("id",user.id).single(),
  s.from("zynth_user_roles").select("role:zynth_roles(key)").eq("user_id",user.id).eq("is_active",true)
 ]);
 if(profile?.account_status==="suspended"||profile?.account_status==="deactivated")redirect("/account-disabled");
 const roles=Array.isArray(roleRows)?roleRows:[];
 if(!roles.includes("trader"))redirect("/dashboard");
 const {data:mt5}=await s.from("zynth_trader_mt5_credentials").select("status").eq("user_id",user.id).maybeSingle();
 const verified=mt5?.status==="verified";
 return <div className="dashboard-frame"><DashboardNav roles={roles}/><NotificationBell/><ThemeSwitcher/><main className="dashboard-main">{verified?children:<TraderMt5Gate/>}</main></div>;
}