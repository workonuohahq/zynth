"use client";
import { useState } from "react";
import { CheckCircle2, Clock3, ShieldCheck, WalletCards, Users, XCircle } from "lucide-react";

const money=(n:any)=>`₦${Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const dt=(v:any)=>v?new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"—";
const mask=(v:any)=>v?`••••••${String(v).slice(-4)}`:"—";

export default function AdminWithdrawalDetail({initial}:{initial:any}){
 const [data,setData]=useState(initial),[busy,setBusy]=useState(""),[notice,setNotice]=useState("");
 const w=data.withdrawal,u=data.user;
 async function act(action:string){
  if(action==="paid"&&!confirm("Confirm this payout has actually been sent to the beneficiary account?"))return;
  const reason=action==="reject"?prompt("Reason for rejection:")||"Withdrawal rejected":null;
  setBusy(action);setNotice("");
  const r=await fetch("/api/admin/withdrawals/process",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({withdrawalId:w.id,action,reason})});
  const j=await r.json();if(!r.ok){setNotice(j.error||"Action failed.");setBusy("");return}
  const fresh=await fetch(`/api/admin/withdrawals/${w.id}`,{cache:"no-store"}).then(x=>x.json());
  if(fresh.withdrawal)setData(fresh);
  setNotice("Withdrawal updated.");setBusy("");
 }
 return <section className="admin-withdrawal-detail">
  <header className="admin-detail-hero"><div><span className="eyebrow">WITHDRAWAL COMMAND CENTER</span><h1>{money(w.net_amount)} payout</h1><p>{w.reference} · {String(w.status).replace("_"," ")} · submitted {dt(w.created_at)}</p></div><span className={"status-text "+w.status}>{String(w.status).replace("_"," ")}</span></header>
  {notice&&<div className="admin-notice">{notice}</div>}
  <div className="admin-withdrawal-summary"><div><span>Gross requested</span><b>{money(w.gross_amount)}</b></div><div><span>Exit fee</span><b>−{money(w.fee_amount)} ({w.fee_pct}%)</b></div><div><span>Net payout</span><b>{money(w.net_amount)}</b></div><div><span>Currency</span><b>{w.currency||"NGN"}</b></div></div>
  <div className="admin-withdrawal-detail-grid">
   <section className="admin-card"><div className="admin-card-head"><div><span className="muted">PAYOUT DESTINATION</span><h2>Beneficiary account</h2><p>Immutable destination snapshot captured at submission.</p></div><ShieldCheck size={20}/></div><div className="admin-destination"><b>{w.account_name||"Not provided"}</b><strong>{w.bank_name||"Bank unavailable"}</strong><code>{w.account_number||"Not provided"}</code><small>{w.beneficiary_id?"Linked beneficiary":"Snapshot destination"}</small></div></section>
   <section className="admin-card"><div className="admin-card-head"><div><span className="muted">CUSTOMER</span><h2>User account</h2><p>Context needed before approving a payout.</p></div><Users size={20}/></div><div className="admin-user-grid"><div><span>Name</span><b>{u.full_name||"Not provided"}</b></div><div><span>Email</span><b>{u.email}</b></div><div><span>Status</span><b>{u.account_status||"active"}</b></div><div><span>KYC</span><b>{u.kyc_verified?"Verified":"Not verified"}</b></div><div><span>Available balance</span><b>{money(u.main_wallet_balance)}</b></div><div><span>Vault balance</span><b>{money(u.locked_vault_balance)}</b></div><div><span>Joined</span><b>{dt(u.created_at)}</b></div></div></section>
   <section className="admin-card"><div className="admin-card-head"><div><span className="muted">BENEFICIARY HISTORY</span><h2>Saved payout accounts</h2><p>Compare the requested destination against the user's saved accounts.</p></div><WalletCards size={20}/></div>{(data.beneficiaries||[]).map((b:any)=><div className="admin-history-row" key={b.id}><div><b>{b.account_name}</b><span>{b.bank_name} · {mask(b.account_number)}</span></div><em>{b.is_verified?"Verified":"Unverified"}{b.is_default?" · Default":""}</em></div>)}</section>
   <section className="admin-card"><div className="admin-card-head"><div><span className="muted">WITHDRAWAL HISTORY</span><h2>Previous payout requests</h2></div><Clock3 size={20}/></div>{(data.withdrawal_history||[]).map((x:any)=><div className="admin-history-row" key={x.id}><div><b>{x.reference}</b><span>{x.bank_name} · {mask(x.account_number)} · {dt(x.created_at)}</span></div><strong>{money(x.net_amount)} · {x.status}</strong></div>)}</section>
   <section className="admin-card admin-wide-card"><div className="admin-card-head"><div><span className="muted">LEDGER CONTEXT</span><h2>Recent account activity</h2><p>Recent transactions for operational and fraud-review context.</p></div></div>{(data.history||[]).slice(0,15).map((x:any)=><div className="admin-history-row" key={x.id}><div><b>{String(x.type).replaceAll("_"," ")}</b><span>{x.reference||"No reference"} · {dt(x.created_at)} · {x.status}</span></div><strong>{money(x.amount)}</strong></div>)}</section>
  </div>
  <footer className="admin-detail-actions">{w.status==="pending"&&<><button className="approve" disabled={!!busy} onClick={()=>act("review")}><CheckCircle2 size={15}/> Review request</button><button className="reject" disabled={!!busy} onClick={()=>act("reject")}><XCircle size={15}/> Reject & refund</button></>}{w.status==="under_review"&&<><button className="approve" disabled={!!busy} onClick={()=>act("processing")}><CheckCircle2 size={15}/> Move to processing</button><button className="reject" disabled={!!busy} onClick={()=>act("reject")}><XCircle size={15}/> Reject & refund</button></>}{w.status==="processing"&&<button className="approve" disabled={!!busy} onClick={()=>act("paid")}><CheckCircle2 size={15}/> Confirm payout sent</button>}</footer>
 </section>
}