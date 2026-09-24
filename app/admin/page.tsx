import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role,full_name").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");
  const { data: settings } = await supabase.from("system_settings").select("global_min_deposit,current_yield_pct,exit_fee_pct,instant_commission_pct,deposits_enabled").single();
  const { data: pending } = await supabase.from("transactions").select("id,user_id,amount,status,created_at").eq("type","withdrawal").eq("status","pending").order("created_at",{ascending:false}).limit(25);
  const { data: agents } = await supabase.from("agent_profiles").select("zpa_id,current_month_activations,total_historical_activations,status").order("current_month_activations",{ascending:false}).limit(25);
  return <main className="shell"><section className="content"><header className="topbar"><div><span className="eyebrow">ZYNTH / ADMIN</span><h1>System control center.</h1></div><span className="pill">PRIVILEGED</span></header><section className="stats"><div className="stat"><span>Minimum deposit</span><b>₦{Number(settings?.global_min_deposit||0).toLocaleString("en-NG")}</b></div><div className="stat"><span>Configured yield</span><b>{Number(settings?.current_yield_pct||0)}%</b></div><div className="stat"><span>Pending withdrawals</span><b>{pending?.length||0}</b></div></section><section className="panel"><span className="muted">ZPA NETWORK</span><h2>{agents?.length||0} agent profiles</h2><p className="copy">The founder control layer exposes configuration and operational monitoring only to admin accounts.</p></section></section></main>;
}
