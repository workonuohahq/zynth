import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Copy, ShieldCheck, Users, WalletCards } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ZpaPage() {
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect("/login");
 const {data:profile}=await supabase.from("users").select("full_name,role").eq("id",user.id).single(); if(profile?.role!=="zpa")redirect("/dashboard");
 const {data:agent}=await supabase.from("agent_profiles").select("zpa_id,current_month_activations,total_historical_activations,status").eq("user_id",user.id).single();
 const {data:tiers}=await supabase.from("zpa_salary_tiers").select("id,name,activation_threshold,monthly_salary").order("sort_order");
 const count=agent?.current_month_activations??0; const next=(tiers||[]).find(t=>t.activation_threshold>count)||tiers?.[tiers.length-1]; const target=next?.activation_threshold??50; const progress=Math.min(100,(count/target)*100);
 return <section className="dashboard-content zpa-content">
  <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / ZPA PORTAL</span><h1>Agent command center.</h1><p>Monitor activations, tier progress and your ZPA status.</p></div><span className="pill">{agent?.status?.toUpperCase()||"UNKNOWN"}</span></header>
  <section className="zpa-hero"><div><span className="muted">YOUR ZPA ID</span><strong>{agent?.zpa_id||"—"}</strong><p>Use your assigned identity when directing eligible users to ZYNTH.</p></div><div className="zpa-hero-icon"><Users size={34}/></div></section>
  <section className="zpa-stats"><div className="panel zpa-stat"><Users size={17}/><span>Monthly activations</span><b>{count}</b></div><div className="panel zpa-stat"><BarChart3 size={17}/><span>Historical activations</span><b>{agent?.total_historical_activations??0}</b></div><div className="panel zpa-stat"><WalletCards size={17}/><span>Current tier target</span><b>{target}</b></div></section>
  <div className="zpa-grid"><section className="panel"><div className="panel-head"><div><span className="muted">TIER PROGRESS</span><h2>{next?.name||"Tier 1"}</h2></div><span className="tier-percent">{Math.round(progress)}%</span></div><div className="tier-track"><span style={{width:`${progress}%`}}/></div><div className="tier-numbers"><span>{count} activations</span><b>{target} required</b></div><p className="copy">Progress is calculated from qualifying funded activations recorded by the server.</p></section>
  <section className="panel"><div className="panel-head"><div><span className="muted">NETWORK SAFETY</span><h2>Operate digitally.</h2></div><ShieldCheck size={18}/></div><p className="copy">Never collect cash or payment credentials from users. Eligible deposits are recorded and credited through the platform.</p><button className="ghost"><Copy size={14}/> ZPA ID: {agent?.zpa_id||"—"}</button></section></div>
  <Link className="zpa-back" href="/dashboard">Return to user dashboard <ArrowUpRight size={14}/></Link>
 </section>;
}