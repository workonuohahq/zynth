"use client";

import { useState } from "react";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";

export default function PaymentSettings({initialData}:{initialData:any}){
 const [form,setForm]=useState({...initialData});
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
 const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));
 async function save(){
  setBusy(true);setNotice("");
  const body={
   minDeposit:Number(form.global_min_deposit||0),yieldPct:Number(form.current_yield_pct||0),exitFeePct:Number(form.exit_fee_pct||0),commissionPct:Number(form.instant_commission_pct||0),depositsEnabled:Boolean(form.deposits_enabled),
   depositPageTitle:form.deposit_page_title,depositPageSubtitle:form.deposit_page_subtitle,depositPageNotice:form.deposit_page_notice,depositInstructions:form.deposit_instructions,
   flutterwaveEnabled:Boolean(form.flutterwave_enabled),flutterwaveTitle:form.flutterwave_title,flutterwaveAccountName:form.flutterwave_account_name,flutterwaveAccountNumber:form.flutterwave_account_number,flutterwaveBankName:form.flutterwave_bank_name,flutterwaveExtra:form.flutterwave_extra,
   paystackEnabled:Boolean(form.paystack_enabled),paystackTitle:form.paystack_title,paystackAccountName:form.paystack_account_name,paystackAccountNumber:form.paystack_account_number,paystackBankName:form.paystack_bank_name,paystackExtra:form.paystack_extra
  };
  try{const r=await fetch("/api/admin/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){setNotice(d.error||"Unable to save.");return;}setForm((x:any)=>({...x,...d.settings}));setNotice("Payment configuration saved.");}catch{setNotice("Unable to connect.");}finally{setBusy(false);}
 }
 const Field=({k,label,area=false}:{k:string,label:string,area?:boolean})=><label style={{display:"grid",gap:7}}><span>{label}</span>{area?<textarea value={form[k]||""} onChange={e=>set(k,e.target.value)} rows={4}/>:<input value={form[k]||""} onChange={e=>set(k,e.target.value)}/>}</label>;
 return <main className="admin-main"><header className="admin-topbar"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ADMIN</span><span className="live-dot"><i/>CONTROL ONLINE</span></div><h1>Payment settings</h1><p>Control every customer-facing instruction and manual payment detail.</p></div><a className="ghost admin-refresh" href="/admin"><ArrowLeft size={15}/> Overview</a></header>
 {notice&&<div className="admin-notice">{notice}</div>}
 <section className="admin-section">
  <section className="admin-card"><div className="admin-card-head"><div><span className="muted">CUSTOMER EXPERIENCE</span><h2>Payment page copy</h2><p>These fields are displayed directly on the in-built payment page.</p></div></div>
   <div className="settings-grid"><Field k="deposit_page_title" label="Page title"/><Field k="deposit_page_subtitle" label="Subtitle"/><Field k="deposit_page_notice" label="Payment notice" area/><Field k="deposit_instructions" label="Payment instructions" area/></div>
  </section>
  <section className="admin-card"><div className="admin-card-head"><div><span className="muted">PAYMENT CHANNELS</span><h2>Flutterwave-style channel</h2><p>Manual details only. No automatic payment gateway is connected.</p></div></div>
   <label className="toggle-row"><span><b>Show Flutterwave</b><small>Display this payment method to customers.</small></span><input type="checkbox" checked={Boolean(form.flutterwave_enabled)} onChange={e=>set("flutterwave_enabled",e.target.checked)}/></label>
   <div className="settings-grid"><Field k="flutterwave_title" label="Display name"/><Field k="flutterwave_account_name" label="Account name"/><Field k="flutterwave_account_number" label="Account / wallet number"/><Field k="flutterwave_bank_name" label="Bank / channel"/><Field k="flutterwave_extra" label="Extra instructions" area/></div>
  </section>
  <section className="admin-card"><div className="admin-card-head"><div><span className="muted">PAYMENT CHANNELS</span><h2>Paystack-style channel</h2><p>Use the same manual configuration model for a second branded-looking payment option.</p></div></div>
   <label className="toggle-row"><span><b>Show Paystack</b><small>Display this payment method to customers.</small></span><input type="checkbox" checked={Boolean(form.paystack_enabled)} onChange={e=>set("paystack_enabled",e.target.checked)}/></label>
   <div className="settings-grid"><Field k="paystack_title" label="Display name"/><Field k="paystack_account_name" label="Account name"/><Field k="paystack_account_number" label="Account / wallet number"/><Field k="paystack_bank_name" label="Bank / channel"/><Field k="paystack_extra" label="Extra instructions" area/></div>
  </section>
  <section className="admin-card"><div className="admin-card-head"><div><span className="muted">GUARDRAILS</span><h2>Funding controls</h2></div></div>
   <div className="settings-grid"><label><span>Minimum deposit</span><input type="number" value={form.global_min_deposit} onChange={e=>set("global_min_deposit",e.target.value)}/></label><label><span>Yield %</span><input type="number" value={form.current_yield_pct} onChange={e=>set("current_yield_pct",e.target.value)}/></label></div>
   <label className="toggle-row"><span><b>Deposits enabled</b><small>Disable this to stop new payment requests.</small></span><input type="checkbox" checked={Boolean(form.deposits_enabled)} onChange={e=>set("deposits_enabled",e.target.checked)}/></label>
  </section>
  <div style={{display:"flex",justifyContent:"flex-end"}}><button className="primary save-settings" onClick={save} disabled={busy}>{busy?"Saving…":<><Save size={15}/> Save payment configuration</>}</button></div>
 </section>
 <div style={{maxWidth:900,margin:"0 auto",color:"#64748b",fontSize:12,display:"flex",gap:8,alignItems:"center"}}><ShieldCheck size={15}/> Manual confirmation is required before customer balances are credited.</div>
 </main>;
}