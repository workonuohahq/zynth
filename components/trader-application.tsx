"use client";
import {useState} from "react";
import {ArrowRight,CheckCircle2,FileText,ShieldCheck,UserRound,LineChart,ShieldAlert} from "lucide-react";

const markets=["Forex","Crypto","Stocks","Indices","Commodities"];

export default function TraderApplication({initial}:{initial:any}){
 const [form,setForm]=useState<any>({displayName:initial?.full_name||"",bio:"",country:"Nigeria",years:"",markets:[],style:"",holding:"",riskManagement:"",risk:"",drawdown:"",broker:"",trackRecord:"",note:""});
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));
 const toggle=(v:string)=>set("markets",form.markets.includes(v)?form.markets.filter((x:string)=>x!==v):[...form.markets,v]);
 async function submit(){
  setBusy(true);setMsg("");
  try{
   const r=await fetch("/api/trader/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});
   const d=await r.json();
   setMsg(r.ok?"Application submitted. An administrator will review your profile and track record.":d.error||"Unable to submit.");
  }catch{setMsg("Unable to submit right now. Please check your connection and try again.")}
  setBusy(false);
 }
 const sections=[
  {n:"01",title:"Identity",text:"How your professional profile will appear to ZYNTH reviewers.",icon:UserRound},
  {n:"02",title:"Trading profile",text:"Define the markets, style and operating profile behind your approach.",icon:LineChart},
  {n:"03",title:"Risk framework",text:"Show how you control downside and protect trading capital.",icon:ShieldAlert},
  {n:"04",title:"Track record",text:"Give reviewers enough evidence to assess your experience.",icon:FileText}
 ];
 return <section className="trader-apply-shell">
  <header className="trader-apply-hero">
   <div><div className="trader-apply-eyebrow"><span className="eyebrow">ZYNTH / TRADER APPLICATION</span><span className="trader-apply-status"><ShieldCheck size={12}/> REVIEWED ACCESS</span></div><h1>Build your trader profile.</h1><p>Tell us how you trade, how you manage risk and what evidence supports your track record. Approval unlocks the Trader Desk; investable strategies are reviewed separately.</p></div>
   <div className="trader-apply-progress"><span>APPLICATION</span><strong>01 — 04</strong><div><i/><i/><i/><i/></div></div>
  </header>
  <div className="trader-apply-layout">
   <main className="trader-apply-form">
    <section className="trader-form-section" id="identity"><div className="trader-section-head"><div className="trader-section-number">01</div><div><span>PROFILE</span><h2>Trading identity</h2><p>Establish the professional identity reviewers will associate with your trader account.</p></div></div>
     <div className="trader-field-grid"><label><span>Display name <em>Required</em></span><input value={form.displayName} onChange={e=>set("displayName",e.target.value)} placeholder="e.g. Buchi Algo"/></label><label><span>Country</span><input value={form.country} onChange={e=>set("country",e.target.value)} placeholder="Country of residence"/></label></div>
     <label className="trader-field trader-field-wide"><span>Professional bio</span><textarea value={form.bio} onChange={e=>set("bio",e.target.value)} placeholder="Summarise your trading background, experience and what defines your approach."/><small>Keep this factual and concise. This is part of your reviewer profile.</small></label>
     <div className="trader-field-grid"><label><span>Years trading</span><input type="number" value={form.years} onChange={e=>set("years",e.target.value)} min="0" placeholder="e.g. 3"/></label><label><span>Broker / execution platform</span><input value={form.broker} onChange={e=>set("broker",e.target.value)} placeholder="Broker or platform"/></label></div>
    </section>

    <section className="trader-form-section"><div className="trader-section-head"><div className="trader-section-number">02</div><div><span>STRATEGY PROFILE</span><h2>How you trade</h2><p>Give reviewers a clear picture of your operating style without exposing proprietary strategy details.</p></div></div>
     <div className="trader-field"><span>Primary markets</span><div className="trader-choice-grid">{markets.map(x=><button type="button" key={x} className={form.markets.includes(x)?"trader-choice active":"trader-choice"} onClick={()=>toggle(x)}>{form.markets.includes(x)&&<CheckCircle2 size={14}/>}<span>{x}</span></button>)}</div></div>
     <div className="trader-field-grid"><label><span>Trading style</span><select value={form.style} onChange={e=>set("style",e.target.value)}><option value="">Select style</option><option>Scalping</option><option>Day trading</option><option>Swing trading</option><option>Position trading</option><option>Systematic</option><option>Discretionary</option></select></label><label><span>Typical holding period</span><select value={form.holding} onChange={e=>set("holding",e.target.value)}><option value="">Select period</option><option>Minutes</option><option>Hours</option><option>Days</option><option>Weeks</option><option>Months</option></select></label></div>
    </section>

    <section className="trader-form-section"><div className="trader-section-head"><div className="trader-section-number">03</div><div><span>RISK FRAMEWORK</span><h2>Capital protection</h2><p>Risk discipline matters as much as returns. Explain the framework behind your decisions.</p></div></div>
     <label className="trader-field trader-field-wide"><span>Risk-management approach</span><textarea value={form.riskManagement} onChange={e=>set("riskManagement",e.target.value)} placeholder="Explain position sizing, stop-loss discipline, exposure limits and how you protect capital during drawdowns."/><small>Focus on your process rather than sharing confidential strategy rules.</small></label>
     <div className="trader-metric-grid"><label><span>Typical risk / trade <em>%</em></span><div className="trader-input-suffix"><input type="number" step="0.01" value={form.risk} onChange={e=>set("risk",e.target.value)} placeholder="0.50"/><b>%</b></div></label><label><span>Historical max drawdown <em>%</em></span><div className="trader-input-suffix"><input type="number" step="0.01" value={form.drawdown} onChange={e=>set("drawdown",e.target.value)} placeholder="10.00"/><b>%</b></div></label></div>
    </section>

    <section className="trader-form-section"><div className="trader-section-head"><div className="trader-section-number">04</div><div><span>VERIFICATION</span><h2>Track record & professional history</h2><p>Provide a verifiable track-record reference. MT5 credentials are submitted separately after trader approval.</p></div></div>
     <div className="trader-field-grid"><label><span>Track-record URL</span><input value={form.trackRecord} onChange={e=>set("trackRecord",e.target.value)} placeholder="https://…"/><small>Performance report, journal or verifiable history.</small></label></div>
     <label className="trader-field trader-field-wide"><span>Applicant note</span><textarea value={form.note} onChange={e=>set("note",e.target.value)} placeholder="Anything important a reviewer should understand about your application."/></label>
     <div className="trader-submit-box"><div><ShieldCheck size={18}/><div><b>Controlled approval</b><small>Approval activates your trader profile. It does not automatically make any strategy investable.</small></div></div><button className="trader-submit" onClick={submit} disabled={busy||!form.displayName.trim()}>{busy?"Submitting application":<>Submit for review <ArrowRight size={16}/></>}</button></div>
     {msg&&<div className="trader-feedback">{msg}</div>}
    </section>
   </main>
   <aside className="trader-apply-sidebar">
    <div className="trader-review-card"><span>REVIEW PROCESS</span><h3>What happens next</h3>{sections.map(({n,title,text:desc,icon:Icon})=><div className="trader-review-step" key={n}><div><Icon size={15}/></div><p><b>{n} · {title}</b><small>{desc}</small></p></div>)}<div className="trader-review-foot"><ShieldCheck size={14}/> Applications are reviewed before trader access is granted.</div></div>
    <div className="trader-side-note"><span>DESIGNED FOR TRUST</span><p>Clear information, controlled access and separate strategy approval keep the trader onboarding process deliberate.</p></div>
   </aside>
  </div>
 </section>
}