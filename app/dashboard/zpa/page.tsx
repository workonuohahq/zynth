import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ZpaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("full_name,role").eq("id", user.id).single();
  if (profile?.role !== "zpa") redirect("/dashboard");

  const { data: agent } = await supabase.from("agent_profiles")
    .select("zpa_id,current_month_activations,total_historical_activations,status")
    .eq("user_id", user.id).single();
  const { data: tiers } = await supabase.from("zpa_salary_tiers")
    .select("id,name,activation_threshold,monthly_salary").order("sort_order");
  const count = agent?.current_month_activations ?? 0;
  const next = (tiers || []).find((t) => t.activation_threshold > count) || tiers?.[tiers.length - 1];

  return <main className="shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div><div className="side-label">ZPA PORTAL</div><nav><a className="nav-item" href="/dashboard">User dashboard</a><a className="nav-item active" href="/dashboard/zpa">Agent portal</a></nav></aside><section className="content"><header className="topbar"><div><span className="eyebrow">ZYNTH / ZPA</span><h1>Agent command center.</h1></div><span className="pill">{agent?.status?.toUpperCase() || "UNKNOWN"}</span></header><section className="stats"><div className="stat"><span>ZPA ID</span><b>{agent?.zpa_id || "—"}</b></div><div className="stat"><span>Monthly activations</span><b>{count}</b></div><div className="stat"><span>Historical activations</span><b>{agent?.total_historical_activations ?? 0}</b></div></section><section className="grid-2"><div className="panel"><span className="muted">MONTHLY TARGET</span><h2>{next ? next.activation_threshold : 50} activations</h2><p className="copy">Progress is calculated from qualifying funded activations recorded by the server. Reaching the threshold is required for the corresponding configured tier.</p><div className="vault-list"><div className="vault-row"><span>Current progress</span><strong>{count} / {next?.activation_threshold ?? 50}</strong></div></div></div><div className="panel dark"><span className="muted">REFERRAL LINK</span><h2>Invite users securely.</h2><p className="copy">Your referral identity is attached server-side when an eligible deposit is activated. Never collect funds directly from users.</p><button className="ghost">ZPA ID: {agent?.zpa_id || "—"}</button></div></section></section></main>;
}
