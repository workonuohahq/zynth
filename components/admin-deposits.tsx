"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Copy, XCircle, RefreshCw } from "lucide-react";

const money=(n:number)=>`₦${Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})`;
const date=(v:string)=>new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});

export default function AdminDeposits({initialData}:{initialData:any}){
  const [rows,setRows]=useState<any[]>(initialData?.recent_deposits||[]);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const pending=rows.filter(x=>x.status==="pending").length;

  async function process(id:string,approved:boolean){
    const note=approved?null:window.prompt("Reason for rejecting this payment:")||"Payment could not be verified";
    setBusy(id);setNotice("");
    try{
      const r=await fetch("/api/admin/deposits/process",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({depositId:id,approved,note})});
      const d=await r.json();
      if(!r.ok){setNotice(d.error||"Unable to process payment.");return;}
      setRows(rows.map(x=>x.id===id?{...x,status:approved?"confirmed":"rejected",admin_note:note}:x));
      setNotice(approved?"Payment confirmed and wallet credited.":"Payment request rejected.");
    }catch{setNotice("Unable to connect.");}
    finally{setBusy("");}
  }

  return <main className="admin-main">
    <header className="admin-topbar"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ADMIN</span><span className="live-dot"><i/>CONTROL ONLINE</span></div><h1>Deposits</h1><p>Review manual payment requests before crediting user wallets.</p></div><button className="ghost admin-refresh" onClick={()=>location.reload()}><RefreshCw size={15}/> Refresh</button></header>
    {notice&&<div className="admin-notice">{notice}</div>}
    <section className="admin-section">
      <section className="admin-card">
        <div className="admin-card-head"><div><span className="muted">MANUAL FUNDING</span><h2>Payment queue</h2><p>Only confirmed payments increase a user's wallet balance.</p></div><span className="admin-count">{pending} pending</span></div>
        <div className="admin-table withdrawal-table">
          {rows.map(r=><div className="admin-row" key={r.id}>
            <div className="admin-person"><span className="avatar"><Clock3 size={14}/></span><span><b>{money(r.amount)}</b><small>{r.full_name||r.email||r.user_id} · {date(r.created_at)}</small></span></div>
            <span className={"status-text "+r.status}>{r.status}</span>
            <span title={r.reference}>{r.reference}<button className="text-action" style={{marginLeft:6}} onClick={()=>navigator.clipboard.writeText(r.reference)}><Copy size={12}/></button></span>
            <div className="row-actions">{r.status==="pending"?<><button className="approve" disabled={busy===r.id} onClick={()=>process(r.id,true)}><CheckCircle2 size={14}/><span>Confirm</span></button><button className="reject" disabled={busy===r.id} onClick={()=>process(r.id,false)}><XCircle size={14}/><span>Reject</span></button></>:<span className="muted">{r.admin_note||r.status}</span>}</div>
          </div>)}
          {!rows.length&&<div className="admin-empty"><Clock3 size={22}/><p>No payment requests.</p></div>}
        </div>
      </section>
    </section>
  </main>
}