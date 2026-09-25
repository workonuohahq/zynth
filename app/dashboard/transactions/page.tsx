"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Clock3, FileText, Search, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Row={id:string;type:string;amount:number;status:string;created_at:string;reference:string|null;metadata?:Record<string,any>|null};
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
 return <section className="dashboard-content"><style jsx>{`\n .ledger-actions{display:flex;align-items:center;gap:6px;margin-top:8px}.ledger-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;padding:5px 9px;border-radius:7px;font-size:10.5px;line-height:1;font-weight:700;text-decoration:none;cursor:pointer;white-space:nowrap;transition:all .15s ease}.ledger-action.primary{background:#111827;color:#fff;border:1px solid #111827}.ledger-action.primary:hover{background:#1f2937}.ledger-action.secondary{background:#fff;color:#475569;border:1px solid #e2e8f0}.ledger-action.secondary:hover{border-color:#cbd5e1;color:#111827}.ledger-action.danger{background:transparent;border:0;color:#b91c1c;padding-left:6px;padding-right:6px}.ledger-action.danger:hover{background:#fef2f2}.ledger-action:disabled{opacity:.55;cursor:not-allowed}\n `}</style>
   <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / ACTIVITY</span><h1>Your activity.</h1><p>Track requests, payment details and every wallet movement.</p></div><Link className="fund-btn" href="/dashboard/vaults">Open vault <ArrowUpRight size={15}/></Link></header>
   {message&&<div className="form-feedback success">{message}</div>}
   <section className="activity-summary"><div><span>Records shown</span><b>{rows.length}</b></div><div><span>Pending requests</span><b>{rows.filter(r=>r.status==="pending").length}</b></div><div><span>Account</span><b>Protected</b></div></section>
   <section className="panel ledger-panel"><div className="panel-head"><div><span className="muted">TRANSACTION LEDGER</span><h2>Recent movements</h2></div><FileText size={18}/></div>
   {loading?<div className="activity-empty"><Clock3 size={18}/><span>Loading activity…</span></div>:rows.length?<div className="ledger-list">{rows.map(r=>{
     const positive=["deposit","cycle_payout","zpa_commission"].includes(r.type), pending=r.status==="pending";
     const isDeposit=r.type==="deposit",isWithdrawal=r.type==="withdrawal";
     const autoVaultDeposit=isDeposit && (r.metadata?.auto_vault===true || r.metadata?.source==="deposit_confirmation");
     const activityLabel=autoVaultDeposit?"vault funded":r.type.replaceAll("_"," ");
     const depositId=String(r.metadata?.deposit_request_id||"");
     const withdrawalRequestId=String(r.metadata?.withdrawal_request_id||"");
     return <div className="ledger-row" key={r.id}>
       <span className={`ledger-icon ${positive?"positive":"neutral"}`}>{positive?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}</span>
       <div className="ledger-main"><b>{activityLabel}</b><small>{new Date(r.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}</small>{r.reference&&<small className="ledger-ref">Ref: {r.reference}</small>}
         {pending&&<div className="ledger-actions">
           {isDeposit&&depositId&&<Link className="ledger-action primary" href={`/dashboard/deposit/${depositId}`}>Payment details <ChevronRight size={12}/></Link>}
           {isDeposit&&depositId&&<button className="ledger-action danger" onClick={()=>cancelDeposit(depositId)} disabled={busy===r.id}>{busy===r.id?"Cancelling…":<><X size={13}/> Cancel</>}</button>}
           {isWithdrawal&&withdrawalRequestId&&<Link className="ledger-action secondary" href={`/dashboard/withdrawal/${withdrawalRequestId}`}>Track <ChevronRight size={12}/></Link>}{isWithdrawal&&pending&&<button className="ledger-action danger" onClick={()=>cancelWithdrawal(String(r.metadata.withdrawal_request_id))} disabled={busy===String(r.metadata.withdrawal_request_id)}>{busy===String(r.metadata.withdrawal_request_id)?"Cancelling…":<><X size={13}/> Cancel request</>}</button>}
         </div>}
       </div>
       <div className="ledger-amount"><b className={positive?"amount-positive":""}>{positive?"+":"−"}{money(r.amount)}</b><small className={r.status==="completed"?"status-complete":r.status==="pending"?"status-pending":"status-failed"}>{r.status}</small></div>
     </div>
   })}</div>:<div className="activity-empty"><Search size={18}/><span>No account activity yet.</span></div>}</section>
 </section>;
}