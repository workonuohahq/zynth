import {createSupabaseServerClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import NotificationBell from "@/components/notification-bell";
import ThemeSwitcher from "@/components/theme-switcher";
export default async function TraderLayout({children}:{children:React.ReactNode}){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const {data:profile}=await s.from("users").select("account_status,role").eq("id",user.id).single();
 if(profile?.account_status==="suspended"||profile?.account_status==="deactivated")redirect("/account-disabled");
 if(profile?.role!=="trader")redirect("/dashboard");
 return <div className="dashboard-frame"><DashboardNav isTrader/><NotificationBell/><ThemeSwitcher/><main className="dashboard-main">{children}</main></div>;
}