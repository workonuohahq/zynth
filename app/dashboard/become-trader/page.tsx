import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import TraderApplication from "@/components/trader-application";
import {CheckCircle2} from "lucide-react";
export default async function BecomeTraderPage(){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await s.from("users").select("id,full_name,role").eq("id",user.id).single();
 if(p?.role==="trader")redirect("/trader");
 const {data:app}=await s.from("zynth_trader_applications").select("*").eq("user_id",user.id).in("status",["pending","under_review","more_info"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
 return <section className="dashboard-content">{app?<><header className="dashboard-header"><div><span className="eyebrow">ZYNTH / TRADER APPLICATION</span><h1>Application under review.</h1><p>Status: <strong>{String(app.status).replaceAll("_"," ")}</strong>. You will see the Trader Desk once approved.</p></div></header><section className="panel"><div className="notice"><CheckCircle2 size={16}/> Your application was received on {new Date(app.created_at).toLocaleDateString("en-NG")}.</div>{app.admin_note&&<p className="muted" style={{marginTop:16}}>{app.admin_note}</p>}</section></>:<TraderApplication initial={p||{}}/>}</section>
}