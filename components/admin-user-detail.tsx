"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Copy, CreditCard, FileText, LockKeyhole, Mail, RefreshCw, ShieldAlert, ShieldCheck, UserRound, Vault, WalletCards, XCircle } from "lucide-react";

const naira=(n:number)=>`₦${Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2})}`;
const date=(v:string|null)=>v?new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"—";

type Detail=any;

export default function AdminUserDetail({initial}:{initial:Detail}){
  const [data,setData]=useState(initial);
  const [tab,setTab]=useState("overview");
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [name,setName]=useState(initial.profile.full_name||"");
  const [kyc,setKyc]=useState(Boolean(initial.profile.kyc_verified));
  const [note,setNote]=useState("");
  const [amount,setAmount]=useState("");
  const [reason,setReason]=useState("");
  const p=data.profile;

  const reload=async()=>{
    setBusy("reload");setNotice("");
    const r=await fetch(`/api/admin/users/${p.id}`,{cache:"no-store"});const j=await r.json();
    if(!r.ok){setNotice(j.error||"Refresh failed.");setBusy("");return}
    setData(j);setName(j.profile.full_name||"");setKyc(Boolean(j.profile.kyc_verified));setBusy("");
  };
  const act=async(action:string,payload:any)=>{
    setBusy(action);setNotice("");
    try{
      const r=await fetch(`/api/admin/users/${p.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Action failed.");
      setNotice(action==="wallet"?"Wallet adjustment posted to the ledger.":action==="note"?"Internal note added.":"User record updated.");
      if(action==="note")setNote("");
      if(action==="wallet"){setAmount("");setReason("");}
      await reload();
    }catch(e){setNotice(e instanceof Error?e.message:"Action failed.");setBusy("");}
  };

  const statusAction=async(status:string)=>{
    const why=window.prompt(`Reason for changing account status to ${status}:`)||"Admin status change";
    if(!why.trim())return;
    await act("status",{status,reason:why});
  };

  const copy=async(v:string)=>{try{await navigator.clipboard.writeText(v);setNotice("User ID copied.");}catch{}};

  return <section className="user-command-page">
    <header className="user-command-header">
      <div>
        <Link href="/admin" className="back-admin"><ArrowLeft size={15}/> Admin control center</Link>
        <div className="user-hero">
          <span className="user-hero-avatar">{(p.full_name||p.email||"U").slice(0,1).toUpperCase()}</span>
          <div><div className="eyebrow-row"><span className="eyebrow">USER COMMAND CENTER</span><span className={`user-status ${p.account_status}`}>{p.account_status}</span></div><h1>{p.full_name||"Unnamed user"}</h1><p><Mail size={13}/>{p.email}<button className="copy-id" onClick={()=>copy(p.id)}><Copy size={12}/>{p.id.slice(0,8)}…</button></p></div>
        </div>
      </div>
      <div className="user-header-actions"><button className="ghost" onClick={reload} disabled={busy==="reload"}><RefreshCw size={15}/>{busy==="reload"?"Refreshing":"Refresh"}</button></div>
    </header>

    {notice&&<div className="admin-notice">{notice}</div>}

    <div className="user-summary-grid">
      <div><WalletCards size={17}/><small>AVAILABLE</small><b>{naira(p.main_wallet_balance)}</b><span>Withdrawable balance</span></div>
      <div><Vault size={17}/><small>LOCKED</small><b>{naira(p.locked_vault_balance)}</b><span>{data.stats.active_vaults} active vaults</span></div>
      <div><CreditCard size={17}/><small>DEPOSITED</small><b>{naira(data.stats.total_deposited)}</b><span>Completed deposits</span></div>
      <div><ShieldCheck size={17}/><small>VERIFICATION</small><b>{p.kyc_verified?"Verified":"Pending"}</b><span>{p.role.toUpperCase()} account</span></div>
    </div>

    <nav className="user-detail-tabs">{["overview","wallet","vaults","deposits","withdrawals","transactions","zpa","activity"].map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>

    {tab==="overview"&&<div className="user-command-grid">
      <section className="admin-card">
        <div className="admin-card-head"><div><span className="muted">ACCOUNT PROFILE</span><h2>Identity & controls</h2><p>Safe account-level administration. Authentication credentials remain managed by Supabase Auth.</p></div></div>
        <div className="profile-edit-grid">
          <label><span>Full name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="User name"/></label>
          <label><span>Email</span><input value={p.email} disabled/></label>
          <label><span>Role</span><input value={p.role} disabled/></label>
          <label><span>KYC status</span><select value={kyc?"verified":"unverified"} onChange={e=>setKyc(e.target.value==="verified")}><option value="unverified">Unverified</option><option value="verified">Verified</option></select></label>
        </div>
        <button className="primary" onClick={()=>act("profile",{full_name:name,kyc_verified:kyc})} disabled={busy==="profile"}>{busy==="profile"?"Saving…":"Save profile"}</button>
      </section>

      <section className="admin-card">
        <div className="admin-card-head"><div><span className="muted">ACCOUNT CONTROL</span><h2>Access state</h2><p>Use restrictions deliberately. Every change is written to the admin audit trail.</p></div></div>
        <div className="status-control-list">
          {[
            ["active","Active","Full platform access",ShieldCheck],
            ["restricted","Restricted","Account visible; financial actions can be limited",LockKeyhole],
            ["suspended","Suspended","Access should be blocked",ShieldAlert],
            ["deactivated","Deactivated","Soft-deactivated; history retained",XCircle]
          ].map(([s,label,desc,Icon]:any)=><button key={s} className={`status-control ${p.account_status===s?"selected":""}`} onClick={()=>p.account_status!==s&&statusAction(s)} disabled={busy==="status"}><Icon size={17}/><span><b>{label}</b><small>{desc}</small></span>{p.account_status===s&&<CheckCircle2 size={16}/>}</button>)}
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head"><div><span className="muted">FINANCIAL SNAPSHOT</span><h2>Account economics</h2></div></div>
        <div className="user-stat-list"><div><span>Projected active-vault profit</span><b>{naira(data.stats.projected_profit)}</b></div><div><span>Total withdrawn</span><b>{naira(data.stats.total_withdrawn)}</b></div><div><span>ZPA commissions</span><b>{naira(data.stats.zpa_earnings)}</b></div><div><span>Vault history</span><b>{data.stats.vault_count} cycles</b></div></div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head"><div><span className="muted">INTERNAL NOTES</span><h2>Operator notes</h2><p>Private notes for administrators. Users cannot see these.</p></div></div>
        <textarea className="admin-note-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Record context, verification details or follow-up…"/>
        <button className="ghost" onClick={()=>act("note",{note})} disabled={!note.trim()||busy==="note"}>Add internal note</button>
        <div className="note-list">{(data.notes||[]).slice(0,5).map((n:any)=><div key={n.id}><b>{n.note}</b><small>{n.admin_name} · {date(n.created_at)}</small></div>)}</div>
      </section>
    </div>}

    {tab==="wallet"&&<section className="admin-card">
      <div className="admin-card-head"><div><span className="muted">WALLET CONTROL</span><h2>Available balance</h2><p>Manual adjustments are exceptional operations. Each one creates a ledger transaction and audit record.</p></div><span className="balance-hero">{naira(p.main_wallet_balance)}</span></div>
      <div className="wallet-adjust-grid">
        <div className="wallet-adjust-card credit"><span>Credit available balance</span><input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount"/><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason / reference"/><button className="primary" onClick={()=>act("wallet",{direction:"credit",amount:Number(amount),reason})}>Credit wallet</button></div>
        <div className="wallet-adjust-card debit"><span>Debit available balance</span><input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount"/><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason / reference"/><button className="ghost danger" onClick={()=>act("wallet",{direction:"debit",amount:Number(amount),reason})}>Debit wallet</button></div>
      </div>
      <div className="admin-warning"><ShieldAlert size={16}/><span>Never use wallet adjustments to bypass deposits, vault maturity, withdrawal review or ZPA calculations. Use the normal workflow whenever possible.</span></div>
    </section>}

    {tab==="vaults"&&<HistoryTable title="Vault history" icon={<Vault size={16}/>} columns={["Cycle","Principal","Projected profit","Maturity","Status"]} rows={(data.vaults||[]).map((v:any)=>[v.id.slice(0,8)+"…",naira(v.principal_amount),naira(v.expected_yield),date(v.maturity_date),v.status])}/>}
    {tab==="deposits"&&<HistoryTable title="Deposit history" icon={<CreditCard size={16}/>} columns={["Amount","Status","Payment reference","Reference","Created"]} rows={(data.deposits||[]).map((d:any)=>[naira(d.amount),d.status,d.payment_reference||"—",d.reference,date(d.created_at)])}/>}
    {tab==="withdrawals"&&<HistoryTable title="Withdrawal history" icon={<WalletCards size={16}/>} columns={["Amount","Status","Reference","Created","Processed"]} rows={(data.withdrawals||[]).map((w:any)=>[naira(w.amount),w.status,w.reference||"—",date(w.created_at),date(w.processed_at)])}/>}
    {tab==="transactions"&&<HistoryTable title="Financial ledger" icon={<FileText size={16}/>} columns={["Type","Amount","Status","Reference","Date"]} rows={(data.transactions||[]).map((t:any)=>[t.type.replaceAll("_"," "),naira(t.amount),t.status,t.reference||"—",date(t.created_at)])}/>}
    {tab==="zpa"&&<section className="admin-card"><div className="admin-card-head"><div><span className="muted">ZPA NETWORK</span><h2>Referral profile</h2></div></div>{data.zpa?<div className="zpa-detail-grid"><div><span>ZPA ID</span><b>{data.zpa.zpa_id}</b></div><div><span>Status</span><b>{data.zpa.status}</b></div><div><span>This month</span><b>{data.zpa.current_month_activations}</b></div><div><span>Historical activations</span><b>{data.zpa.total_historical_activations}</b></div></div>:<div className="admin-empty"><ShieldCheck size={22}/><p>No ZPA profile for this user.</p></div>}</section>}
    {tab==="activity"&&<HistoryTable title="Audit activity" icon={<Clock3 size={16}/>} columns={["Action","Target","Time"]} rows={(data.activity||[]).map((a:any)=>[a.action,a.target_type,date(a.created_at)])}/>}
  </section>;
}

function HistoryTable({title,icon,columns,rows}:{title:string;icon:any;columns:string[];rows:any[][]}){
 return <section className="admin-card history-card"><div className="admin-card-head"><div><span className="muted">RECORDS</span><h2>{icon} {title}</h2></div><span className="admin-count">{rows.length} records</span></div><div className="user-history-table"><div className="user-history-head">{columns.map(c=><span key={c}>{c}</span>)}</div>{rows.map((r,i)=><div className="user-history-row" key={i}>{r.map((c,j)=><span key={j}>{c}</span>)}</div>)}{!rows.length&&<div className="admin-empty"><FileText size={22}/><p>No records yet.</p></div>}</div></section>
}
