"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock3, FileText, Search, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Row={id:string;type:string;amount:number;status:string;created_at:string;reference:string|null;metadata?:Record<string,unknown>|null};
const money=(v:unknown)=>`₦${Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function TransactionsPage(){
 const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 async function load(){
   const supabase=createSupabaseBrowserClient();
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return;}
   const {data}=await supabase.from("transactions").select("id,type,amount,status,created_at,reference,metadata").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
   setRows((data||[]) as Row[]);setLoading(false);
 }
 useEffect(()=>{load()},[]);
 async function cancelDeposit(id:string){
   if(!confirm("Cancel this pending deposit request? You can start a new request afterwards."))return;
   setBusy(id);setMessage("");
   const r=await fetch("/api/deposits/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({depositId:id})});
   const d=await r.json();setBusy("");if(!r.ok){setMessage(d.error||"Unable to cancel request.");return;}setMessage("Deposit request cancelled.");load();
 }
 async function cancelWithdrawal(id:string){
   if(!confirm("Cancel this pending withdrawal? The reserved funds will be returned to your available balance."))return;
   setBusy(id);setMessage("");
   const r=await fetch("/api/withdrawals/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({withdrawalId:id})});
   const d=await r.json();setBusy("");if(!r.ok){setMessage(d.error||"Unable to cancel request.");return;}setMessage("Withdrawal cancelled and funds returned.");load();
 }
 return <section className="dashboard-content"><style jsx>{`\n .ledger-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.ledger-action{display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:9px;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer}.ledger-action.primary{background:#111827;color:#fff}.ledger-action.danger{background:#fff;border:1px solid #e2e8f0;color:#b91c1c}.ledger-action:disabled{opacity:.55;cursor:not-allowed}\n `}</style>
   <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / ACTIVITY</span><h1>Your activity.</h1><p>Track requests, payment details and every wallet movement.</p></div><Link className="fund-btn" href="/dashboard/vaults">Open vault <ArrowUpRight size={15}/></Link></header>
   {message&&<div className="form-feedback success">{message}</div>}
   <section className="activity-summary"><div><span>Records shown</span><b>{rows.length}</b></div><div><span>Pending requests</span><b>{rows.filter(r=>r.status==="pending").length}</b></div><div><span>Account</span><b>Protected</b></div></section>
   <section className="panel ledger-panel"><div className="panel-head"><div><span className="muted">TRANSACTION LEDGER</span><h2>Recent movements</h2></div><FileText size={18}/></div>
   {loading?<div className="activity-empty"><Clock3 size={18}/><span>Loading activity…</span></div>:rows.length?<div className="ledger-list">{rows.map(r=>{
     const positive=["deposit","cycle_payout","zpa_commission"].includes(r.type), pending=r.status==="pending";
     const isDeposit=r.type==="deposit",isWithdrawal=r.type==="withdrawal";
     const depositId=String(r.metadata?.deposit_request_id||"");
     return <div className="ledger-row" key={r.id}>
       <span className={`ledger-icon ${positive?"positive":"neutral"}`}>{positive?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</span>
       <div className="ledger-main"><b>{r.type.replaceAll("_"," ")}</b><small>{new Date(r.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}</small>{r.reference&&<small className="ledger-ref">Ref: {r.reference}</small>}
         {pending&&<div className="ledger-actions">
           {isDeposit&&depositId&&<Link className="ledger-action primary" href={`/dashboard/deposit/${depositId}`}>View payment details <ChevronRight size={13}/></Link>}
           {isDeposit&&depositId&&<button className="ledger-action danger" onClick={()=>cancelDeposit(depositId)} disabled={busy===r.id}>{busy===r.id?"Cancelling…":<><X size={13}/> Cancel</>}</button>}
           {isWithdrawal&&<button className="ledger-action danger" onClick={()=>cancelWithdrawal(r.id)} disabled={busy===r.id}>{busy===r.id?"Cancelling…":<><X size={13}/> Cancel request</>}</button>}
         </div>}
       </div>
       <div className="ledger-amount"><b className={positive?"amount-positive":""}>{positive?"+":"−"}{money(r.amount)}</b><small className={r.status==="completed"?"status-complete":r.status==="pending"?"status-pending":"status-failed"}>{r.status}</small></div>
     </div>
   })}</div>:<div className="activity-empty"><Search size={18}/><span>No account activity yet.</span></div>}</section>
 </section>;
}