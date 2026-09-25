import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, FileText, Search } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const money=(v:unknown)=>`₦${Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export default async function TransactionsPage(){
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect("/login");
 const {data:rows}=await supabase.from("transactions").select("id,type,amount,status,created_at,reference").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
 return <section className="dashboard-content">
   <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / ACTIVITY</span><h1>Your activity.</h1><p>A clear record of every wallet and vault movement.</p></div><Link className="fund-btn" href="/dashboard/vaults">Open vault <ArrowUpRight size={15}/></Link></header>
   <section className="activity-summary"><div><span>Records shown</span><b>{rows?.length||0}</b></div><div><span>Ledger</span><b>Live</b></div><div><span>Account</span><b>Protected</b></div></section>
   <section className="panel ledger-panel"><div className="panel-head"><div><span className="muted">TRANSACTION LEDGER</span><h2>Recent movements</h2></div><FileText size={18}/></div>
   {rows?.length ? <div className="ledger-list">{rows.map(r=>{const positive=["deposit","cycle_payout","zpa_commission"].includes(r.type);return <div className="ledger-row" key={r.id}><span className={`ledger-icon ${positive?"positive":"neutral"}`}>{positive?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</span><div className="ledger-main"><b>{r.type.replaceAll("_"," ")}</b><small>{new Date(r.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}</small>{r.reference&&<small className="ledger-ref">Ref: {r.reference}</small>}</div><div className="ledger-amount"><b className={positive?"amount-positive":""}>{positive?"+":"−"}{money(r.amount)}</b><small className={r.status==="completed"?"status-complete":r.status==="pending"?"status-pending":"status-failed"}>{r.status}</small></div><ChevronRight size={15} className="ledger-chevron"/></div>})}</div> : <div className="activity-empty"><Search size={18}/><span>No account activity yet.</span></div>}</section>
 </section>;
}