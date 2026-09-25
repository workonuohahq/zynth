"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";

export default function VaultsPage(){
  const [amount,setAmount]=useState("5500"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function create(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/vault/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount:Number(amount)})});
      const d=await r.json(); setMessage(r.ok?"Vault created successfully.":d.error||"Unable to create vault.");
    }catch{setMessage("Unable to connect. Please try again.");}
    finally{setBusy(false);}
  }
  return <section className="dashboard-content">
    <header className="dashboard-header">
      <div><span className="eyebrow">ZYNTH / VAULTS</span><h1>Build your position.</h1><p>Put available funds into a 5-day cycle and track it from one place.</p></div>
      <Link className="fund-btn secondary-dark" href="/dashboard"><ArrowLeft size={16}/> Overview</Link>
    </header>
    <div className="vault-page-grid">
      <section className="panel vault-create-panel">
        <div className="vault-icon-large"><LockKeyhole size={21}/></div>
        <span className="muted">OPEN A NEW CYCLE</span><h2>5-day yield vault</h2>
        <p className="copy">Choose an amount from your available wallet balance. The server validates your balance and creates the vault atomically.</p>
        <label className="input-label">AMOUNT</label>
        <div className="money-input"><span>₦</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} aria-label="Vault amount"/></div>
        <div className="amount-presets">{["5500","10000","25000","50000"].map(v=><button key={v} onClick={()=>setAmount(v)} className={amount===v?"selected":""}>₦{Number(v).toLocaleString("en-NG")}</button>)}</div>
        <button className="primary full-button" onClick={create} disabled={busy}>{busy?"Processing…":"Open 5-day vault"} <ArrowUpRight size={16}/></button>
        {message&&<div className="form-feedback"><CheckCircle2 size={15}/>{message}</div>}
      </section>
      <aside className="vault-info-stack">
        <section className="panel vault-info-card"><span className="muted">HOW IT WORKS</span><div className="info-step"><span>01</span><div><b>Choose amount</b><small>Use funds already available in your wallet.</small></div></div><div className="info-step"><span>02</span><div><b>Cycle begins</b><small>Your 5-day maturity clock starts after successful creation.</small></div></div><div className="info-step"><span>03</span><div><b>Track maturity</b><small>Monitor principal and configured yield from your dashboard.</small></div></div></section>
        <section className="panel vault-safety"><ShieldCheck size={18}/><div><b>Protected execution</b><p>Vault creation and balance checks are enforced server-side.</p></div></section>
      </aside>
    </div>
    <section className="vault-expectations">
      <div><CalendarDays size={17}/><span><b>5 days</b><small>Cycle duration</small></span>
      <WalletCards size={17}/><span><b>₦5,500 minimum</b><small>Minimum configured deposit</small></span>
      <ShieldCheck size={17}/><span><b>Server validated</b><small>Every cycle is recorded</small></span></div>
    </section>
  </section>
}