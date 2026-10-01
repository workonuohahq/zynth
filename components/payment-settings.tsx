"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Save, ShieldCheck } from "lucide-react";

export default function PaymentSettings({initialData}:{initialData:any}){
 const [form,setForm]=useState({...initialData});
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
 const [crypto,setCrypto]=useState<any>(null);
 const [cryptoForm,setCryptoForm]=useState<any>({enabled:false,usd_ngn_rate:"",fx_source:"ZYNTH controlled FX rate",fixed_rate:true,fee_paid_by_user:true,zynth_enabled_currencies:[],api_key:"",ipn_secret:""});
 const [cryptoBusy,setCryptoBusy]=useState(false); const [cryptoNotice,setCryptoNotice]=useState("");

 const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));
 const setCrypto=(k:string,v:any)=>setCryptoForm((x:any)=>({...x,[k]:v}));

 useEffect(()=>{
  fetch("/api/admin/payment-provider",{cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load crypto settings.");setCrypto(d.settings);setCryptoForm({
     enabled:Boolean(d.settings?.enabled),
     usd_ngn_rate:d.settings?.usd_ngn_rate??"",
     fx_source:d.settings?.fx_source||"ZYNTH controlled FX rate",
     fixed_rate:Boolean(d.settings?.fixed_rate),
     fee_paid_by_user:Boolean(d.settings?.fee_paid_by_user),
     zynth_enabled_currencies:Array.isArray(d.settings?.supported_currencies)?d.settings.supported_currencies:[],
     api_key:"",ipn_secret:""
   });})
   .catch(e=>setCryptoNotice(e.message||"Unable to load crypto settings."));
 },[]);

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

 async function saveCrypto(){
  setCryptoBusy(true);setCryptoNotice("");
  try{
   const r=await fetch("/api/admin/payment-provider",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(cryptoForm)});
   const d=await r.json();
   if(!r.ok) throw new Error(d.error||"Unable to save NOWPayments settings.");
   setCrypto(d.settings);
   setCryptoForm((x:any)=>({...x,api_key:"",ipn_secret:""}));
   setCryptoNotice("NOWPayments settings saved. New crypto checkouts now use the saved USD/NGN rate.");
  }catch(e:any){setCryptoNotice(e.message||"Unable to save NOWPayments settings.");}
  finally{setCryptoBusy(false);}
 }

 async function syncCrypto(){
  setCryptoBusy(true);setCryptoNotice("");
  try{
   const r=await fetch("/api/admin/payment-provider",{method:"POST"});
   const d=await r.json();
   if(!r.ok) throw new Error(d.error||"NOWPayments sync failed.");
   const fresh=await fetch("/api/admin/payment-provider",{cache:"no-store"}).then(x=>x.json());
   if(fresh.settings){setCrypto(fresh.settings);setCryptoForm((x:any)=>({...x,zynth_enabled_currencies:fresh.settings.supported_currencies||[]}));}
   setCryptoNotice(d.message||"NOWPayments merchant catalog synced.");
  }catch(e:any){setCryptoNotice(e.message||"NOWPayments sync failed.");}
  finally{setCryptoBusy(false);}
 }

 const toggleCurrency=(code:string)=>{
  const current=new Set(cryptoForm.zynth_enabled_currencies||[]);
  current.has(code)?current.delete(code):current.add(code);
  setCrypto("zynth_enabled_currencies",Array.from(current));
 };
 const Field=({k,label,area=false}:{k:string,label:string,area?:boolean})=><label style={{display:"grid",gap:7}}><span>{label}</span>{area?<textarea value={form[k]||""} onChange={e=>set(k,e.target.value)} rows={4}/>:<input value={form[k]||""} onChange={e=>set(k,e.target.value)}/>}</label>;

 return <main className="admin-main"><header className="admin-topbar"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ADMIN</span><span className="live-dot"><i/>CONTROL ONLINE</span></div><h1>Payment settings</h1><p>Control every customer-facing instruction and payment channel.</p></div><a className="ghost admin-refresh" href="/admin"><ArrowLeft size={15}/> Overview</a></header>
 {notice&&<div className="admin-notice">{notice}</div>}

 <section className="admin-section">
  <section className="admin-card">
   <div className="admin-card-head"><div><span className="muted">CRYPTO PAYMENTS</span><h2>NOWPayments · USD pricing bridge</h2><p>ZYNTH keeps investment accounting in NGN, converts once using this controlled FX rate, then sends USD to NOWPayments.</p></div><button className="ghost" onClick={syncCrypto} disabled={cryptoBusy}><RefreshCw size={14}/> Sync assets</button></div>
   {cryptoNotice&&<div className="admin-notice">{cryptoNotice}</div>}
   <div className="settings-grid">
    <label><span>NGN per USD</span><input type="number" min="1" step="0.0001" value={cryptoForm.usd_ngn_rate} onChange={e=>setCrypto("usd_ngn_rate",e.target.value)}/></label>
    <label><span>FX source / note</span><input value={cryptoForm.fx_source||""} onChange={e=>setCrypto("fx_source",e.target.value)}/></label>
   </div>
   <div style={{display:"grid",gap:9,marginTop:12}}>
    <label className="toggle-row"><span><b>Enable crypto funding</b><small>Only enabled merchant assets can be selected.</small></span><input type="checkbox" checked={Boolean(cryptoForm.enabled)} onChange={e=>setCrypto("enabled",e.target.checked)}/></label>
    <label className="toggle-row"><span><b>NOWPayments fixed rate</b><small>Locks the provider quote for the supported fixed-rate window.</small></span><input type="checkbox" checked={Boolean(cryptoForm.fixed_rate)} onChange={e=>setCrypto("fixed_rate",e.target.checked)}/></label>
    <label className="toggle-row"><span><b>Fee paid by user</b><small>Passes applicable NOWPayments payment fees to the customer.</small></span><input type="checkbox" checked={Boolean(cryptoForm.fee_paid_by_user)} onChange={e=>setCrypto("fee_paid_by_user",e.target.checked)}/></label>
   </div>
   <div style={{marginTop:15}}>
    <span className="muted">ENABLED MERCHANT ASSETS</span>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginTop:9}}>
     {(crypto?.currencies||[]).filter((x:any)=>x.provider_available).map((x:any)=><label key={x.currency_code} style={{display:"flex",gap:8,alignItems:"center",padding:"9px 10px",border:"1px solid #302b24",borderRadius:9}}>
      <input type="checkbox" checked={(cryptoForm.zynth_enabled_currencies||[]).includes(x.currency_code)} onChange={()=>toggleCurrency(x.currency_code)}/>
      <span><b style={{fontSize:11}}>{x.symbol||x.currency_code.toUpperCase()}</b><small style={{display:"block",color:"#777067",fontSize:8}}>{x.network||x.name||"Asset"}</small></span>
     </label>)}
    </div>
   </div>
   <div className="settings-grid" style={{marginTop:15}}>
    <label><span>NOWPayments API key</span><input type="password" placeholder={crypto?.api_key_configured?"Configured · leave blank to keep":"Enter API key"} value={cryptoForm.api_key||""} onChange={e=>setCrypto("api_key",e.target.value)}/></label>
    <label><span>IPN secret</span><input type="password" placeholder={crypto?.ipn_secret_configured?"Configured · leave blank to keep":"Enter IPN secret"} value={cryptoForm.ipn_secret||""} onChange={e=>setCrypto("ipn_secret",e.target.value)}/></label>
   </div>
   <div style={{display:"flex",justifyContent:"flex-end",marginTop:15}}><button className="primary save-settings" onClick={saveCrypto} disabled={cryptoBusy}>{cryptoBusy?"Saving…":<><Save size={15}/> Save crypto configuration</>}</button></div>
   {crypto?.fx_updated_at&&<div style={{marginTop:10,color:"#706960",fontSize:9}}>FX snapshot last changed: {new Date(crypto.fx_updated_at).toLocaleString()} · provider pricing currency: USD</div>}
  </section>

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