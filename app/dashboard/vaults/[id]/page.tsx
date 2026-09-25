import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarClock, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
const money=(v:unknown)=>`₦${Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=(v:string)=>new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});
export default async function VaultDetail({params}:{params:{id:string}}){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser(); if(!user)redirect("/login");
 const {data:v}=await s.from("vaults").select("id,principal_amount,expected_yield,start_date,maturity_date,status,created_at").eq("id",params.id).eq("user_id",user.id).single();
 if(!v)notFound();
 const remaining=Math.max(0,new Date(v.maturity_date).getTime()-Date.now()); const days=Math.ceil(remaining/86400000);
 const duration=Math.max(1,new Date(v.maturity_date).getTime()-new Date(v.start_date).getTime()); const elapsed=Math.min(duration,Math.max(0,Date.now()-new Date(v.start_date).getTime())); const progress=Math.min(100,Math.round(elapsed/duration*100));
 return <section className="dashboard-content"><header className="dashboard-header"><div><span className="eyebrow">ZYNTH / VAULT DETAIL</span><h1>Vault position.</h1><p>Full cycle timeline and position details.</p></div><Link className="fund-btn secondary-dark" href="/dashboard/vaults"><ArrowLeft size={16}/> Back to vaults</Link></header>
 <section className="vault-detail-hero panel"><div><span className={"status-badge "+(v.status!=="active"?"":"")}><i/> {v.status.toUpperCase()}</span><strong>{money(v.principal_amount)}</strong><p>Principal locked in this 5-day cycle.</p></div><div className="vault-detail-yield"><span>Configured yield</span><b>+{money(v.expected_yield)}</b><small>Expected at creation</small></div></section>
 <div className="vault-detail-grid"><section className="panel"><div className="panel-head"><div><span className="muted">CYCLE TIMELINE</span><h2>{v.status==="active"?days+" days remaining":"Cycle completed"}</h2></div><Clock3 size={18}/></div><div className="detail-progress"><span style={{width:`${progress}%`}}/></div><div className="timeline"><div><span><CheckCircle2 size={14}/></span><p><b>Cycle started</b><small>{date(v.start_date)}</small></p></div><div><span><CalendarClock size={14}/></span><p><b>Maturity</b><small>{date(v.maturity_date)}</small></p></div></div></section>
 <aside className="panel"><span className="muted">POSITION DETAILS</span><div className="detail-list"><div><span>Principal</span><b>{money(v.principal_amount)}</b></div><div><span>Expected yield</span><b>+{money(v.expected_yield)}</b></div><div><span>Expected total</span><b>{money(Number(v.principal_amount)+Number(v.expected_yield))}</b></div><div><span>Created</span><b>{date(v.created_at)}</b></div></div><div className="vault-safety"><ShieldCheck size={17}/><div><b>Server recorded</b><p>This position belongs only to your authenticated account.</p></div></div></aside></div>
 <Link className="primary" href="/dashboard/transactions">View related activity <ArrowUpRight size={15}/></Link>
 </section>
}