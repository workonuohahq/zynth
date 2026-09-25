"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, CheckCircle2, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";

export default function VaultsPage(){
  const [amount,setAmount]=useState("5500"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[vaults,setVaults]=useState<any[]>([]);
  useEffect(()=>{fetch("/api/account/vaults").then(r=>r.ok?r.json():null).then(d=>d&&setVaults(d.vaults||[])).catch(()=>{});},[]);
  async function create(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/deposits/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount:Number(amount),method:"manual"})});
      const d=await r.json();
      if(!r.ok){setMessage(d.error||"Unable to start payment.");return;}
      window.location.href="/dashboard/deposit/"+d.request.id;
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
        <p className="copy">Choose the amount you want to place into a vault. ZYNTH will take you to the built-in payment page first if the funds need to be deposited manually.</p>
        <label className="input-label">AMOUNT</label>
        <div className="money-input"><span>₦</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} aria-label="Vault amount"/></div>
        <div className="amount-presets">{["5500","10000","25000","50000"].map(v=><button key={v} onClick={()=>setAmount(v)} className={amount===v?"selected":""}>₦{Number(v).toLocaleString("en-NG")}</button>)}</div>
        <button className="primary full-button" onClick={create} disabled={busy}>{busy?"Preparing payment…":"Continue to payment"} <ArrowUpRight size={16}/></button>
        {message&&<div className="form-feedback"><CheckCircle2 size={15}/>{message}</div>}
      </section>
      <aside className="vault-info-stack">
        <section className="panel vault-info-card"><span className="muted">HOW IT WORKS</span><div className="info-step"><span>01</span><div><b>Choose amount</b><small>Enter the amount you want to fund into your vault.</small></div></div><div className="info-step"><span>02</span><div><b>Complete payment</b><small>Use the built-in payment page and follow the configured manual instructions.</small></div></div><div className="info-step"><span>03</span><div><b>Open the vault</b><small>After confirmation, your wallet is credited and you can start the 5-day cycle.</small></div></div></section>
        <section className="panel vault-safety"><ShieldCheck size={18}/><div><b>Protected execution</b><p>Payment confirmation and vault creation are validated server-side.</p></div></section>
      </aside>
    </div>
    <section className="panel vault-history-panel"><div className="panel-head"><div><span className="muted">YOUR POSITIONS</span><h2>Vault history</h2></div></div>{vaults.length?<div className="vault-history-list">{vaults.map(v=><Link className="vault-history-row" href={"/dashboard/vaults/"+v.id} key={v.id}><span><b>₦{Number(v.principal_amount).toLocaleString("en-NG",{minimumFractionDigits:2})}</b><small>{v.status} · matures {new Date(v.maturity_date).toLocaleDateString("en-NG")}</small></span><strong>+₦{Number(v.expected_yield).toLocaleString("en-NG",{minimumFractionDigits:2})}</strong><ArrowUpRight size={15}/></Link>)}</div>:<p className="copy">No vault positions yet.</p>}</section>
    <section className="vault-expectations">
      <div><CalendarDays size={17}/><span><b>5 days</b><small>Cycle duration</small></span>
      <WalletCards size={17}/><span><b>₦5,500 minimum</b><small>Minimum configured deposit</small></span>
      <ShieldCheck size={17}/><span><b>Server validated</b><small>Every cycle is recorded</small></span></div>
    </section>
  </section>
}