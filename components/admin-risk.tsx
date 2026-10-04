"use client";
import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,ChevronRight,Clock3,Filter,RefreshCw,Save,ShieldAlert,ShieldCheck,SlidersHorizontal,Users,WalletCards,XCircle} from "lucide-react";

type Rule={rule_key:string;name:string;description?:string;enabled:boolean;points:number;threshold_count:number;window_minutes:number;action:string;config?:Record<string,unknown>};
const money=(n:any)=>"₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
const sections=[
 ["overview","Risk Overview","Command view",ShieldCheck],
 ["critical","Critical","Immediate review",ShieldAlert],
 ["high","High","Priority review",AlertTriangle],
 ["medium","Medium","Monitor",Clock3],
 ["low","Low","Low risk",CheckCircle2],
 ["aml_alerts","AML Alerts","Compliance",ShieldAlert],
 ["kyc_reviews","KYC Reviews","Identity",Users],
 ["suspicious_users","Suspicious Users","Behaviour",Users],
 ["device_clusters","Device Clusters","Shared devices",Users],
 ["bank_clusters","Bank Clusters","Shared banking",WalletCards],
 ["crypto_clusters","Crypto Address Clusters","Shared addresses",WalletCards],
 ["referral_fraud","Referral Fraud","Acquisition",Users],
 ["zpa_fraud","ZPA Fraud","Acquisition",Users],
 ["account_takeover","Account Takeover","ATO signals",ShieldAlert],
 ["withdrawal_risk","Withdrawal Risk","Money movement",WalletCards],
] as const;

export default function AdminRisk(){
 const[d,setD]=useState<any>({overview:{},rules:[]}),[loading,setLoading]=useState(true),[section,setSection]=useState("overview"),[saving,setSaving]=useState(""),[notice,setNotice]=useState(""),[search,setSearch]=useState("");
 async function load(){
  setLoading(true);setNotice("");
  try{const r=await fetch("/api/admin/risk?limit=100",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load Risk & Compliance.");setD(j)}
  catch(e){setNotice(e instanceof Error?e.message:"Unable to load Risk & Compliance.")}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[]);
 async function resolve(id:string,status:string,action:string){
  setSaving(id);setNotice("");
  try{const r=await fetch("/api/admin/risk",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"resolve",caseId:id,status,riskAction:action,note:"Admin Risk & Compliance review"})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Risk action failed.");setNotice(status==="RESOLVED"?"Risk case cleared.":"Risk case moved to review.");await load()}catch(e){setNotice(e instanceof Error?e.message:"Risk action failed.")}finally{setSaving("")}
 }
 async function saveRule(rule:Rule){
  setSaving(rule.rule_key);setNotice("");
  try{const r=await fetch("/api/admin/risk",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_rule",ruleKey:rule.rule_key,enabled:rule.enabled,points:Math.max(0,Math.min(100,Number(rule.points))),thresholdCount:Math.max(1,Number(rule.threshold_count)),windowMinutes:Math.max(1,Number(rule.window_minutes)),riskAction:String(rule.action||"FLAG"),config:rule.config||{}})});const j=await r.json();if(!r.ok)throw new Error(j.error||"Could not update rule.");setNotice("Risk rule updated.");await load()}catch(e){setNotice(e instanceof Error?e.message:"Could not update rule.")}finally{setSaving("")}
 }
 const o=d.overview||{};
 const rows=section==="overview"?[]:(d[section]||[]);
 const selected=sections.find(x=>x[0]===section);
 const filtered=useMemo(()=>rows.filter((x:any)=>{if(!search.trim())return true;const q=search.toLowerCase();return [x.full_name,x.email,x.user_id,x.reason,x.description,x.cluster_key,x.flag_type,x.status,x.classification,x.action,x.address_masked,x.bank_name].some(v=>String(v||"").toLowerCase().includes(q))}),[rows,search]);
 const updateRule=(key:string,patch:Partial<Rule>)=>setD((x:any)=>({...x,rules:(x.rules||[]).map((r:Rule)=>r.rule_key===key?{...r,...patch}:r)}));
 return <section className="admin-risk">
  <header className="risk-header">
   <div>
    <div className="risk-eyebrow"><span>RISK & COMPLIANCE</span><i/> CENTRAL CONTROL</div>
    <h2>Risk intelligence</h2>
    <p>One evidence-driven risk engine across identity, behaviour, referrals, ZPA and withdrawals.</p>
   </div>
   <button className="risk-refresh" onClick={load} disabled={loading}><RefreshCw size={15} className={loading?"risk-spin":""}/>{loading?"Refreshing…":"Refresh"}</button>
  </header>

  {notice&&<div className="risk-notice"><ShieldCheck size={16}/><span>{notice}</span><button aria-label="Dismiss" onClick={()=>setNotice("")}><XCircle size={15}/></button></div>}

  <div className="risk-kpis">
   {(["critical","high","medium","low"] as const).map(k=><button key={k} className={"risk-kpi risk-kpi-"+k} onClick={()=>setSection(k)}><span>{k}</span><strong>{Number(o[k]||0)}</strong><small>{k==="critical"?"Immediate attention":k==="high"?"Priority review":k==="medium"?"Monitor closely":"No immediate action"}</small><ChevronRight size={15}/></button>)}
  </div>

  <div className="risk-layout">
   <aside className="risk-nav">
    <div className="risk-nav-title"><SlidersHorizontal size={14}/> Control views</div>
    {sections.map(([key,label,desc,Icon])=><button key={key} className={section===key?"active":""} onClick={()=>{setSection(key);setSearch("")}}><span className="risk-nav-icon"><Icon size={14}/></span><span><b>{label}</b><small>{desc}</small></span>{key!=="overview"&&<em>{Number(o[key]||0)}</em>}</button>)}
   </aside>

   <main className="risk-content">
    {section==="overview"&&<div className="risk-overview">
      <section className="risk-card risk-hero-card">
       <div className="risk-card-heading"><div><span>RISK POSTURE</span><h3>Central risk engine</h3><p>Signals inform review; they do not automatically treat shared IPs as proof of fraud.</p></div><span className="risk-live"><i/> LIVE</span></div>
       <div className="risk-posture-grid">
        {(["critical","high","medium","low"] as const).map(k=><button key={k} onClick={()=>setSection(k)}><span className={"risk-level-dot "+k}/><b>{Number(o[k]||0)}</b><small>{k} cases</small></button>)}
       </div>
      </section>
      <section className="risk-card">
       <div className="risk-card-heading"><div><span>OPEN CASES</span><h3>Priority queue</h3><p>Review the highest-risk cases first.</p></div><button className="risk-link" onClick={()=>setSection("critical")}>Open critical <ArrowRight size={14}/></button></div>
       <div className="risk-case-list">{[...(d.critical||[]),...(d.high||[])].slice(0,8).map((x:any,i:number)=><div className="risk-case" key={x.case_id||x.user_id||i}><div className="risk-person"><span className="risk-avatar">{String(x.full_name||x.email||"U").slice(0,1).toUpperCase()}</span><span><b>{x.full_name||x.email||x.user_id||"Unknown user"}</b><small>{x.email||"Risk case"} · {x.classification||"Review"}</small></span></div><span className="risk-score">{Number(x.score||0)}/100</span>{x.case_id&&<button className="risk-action" disabled={saving===x.case_id} onClick={()=>resolve(x.case_id,"IN_REVIEW","MONITOR")}>{saving===x.case_id?"…":"Review"}</button>}</div>)}{!(d.critical||[]).length&&!(d.high||[]).length&&<div className="risk-empty"><CheckCircle2 size={20}/><b>No priority cases</b><span>The risk queue is clear.</span></div>}</div>
      </section>
      <section className="risk-card risk-rules-card">
       <div className="risk-card-heading"><div><span>POLICY ENGINE</span><h3>Risk rules</h3><p>Server-side controls used by the central risk engine.</p></div><span className="risk-count">{(d.rules||[]).length} rules</span></div>
       <div className="risk-rule-grid">{(d.rules||[]).map((r:Rule)=><article className="risk-rule" key={r.rule_key}>
        <div className="risk-rule-top"><div><b>{r.name||r.rule_key}</b><small>{r.description||r.rule_key}</small></div><label className="risk-switch"><input type="checkbox" checked={Boolean(r.enabled)} onChange={e=>updateRule(r.rule_key,{enabled:e.target.checked})}/><span/></label></div>
        <div className="risk-rule-fields">
         <label><span>POINTS</span><input type="number" min={0} max={100} value={r.points} onChange={e=>updateRule(r.rule_key,{points:Number(e.target.value)})}/></label>
         <label><span>COUNT</span><input type="number" min={1} value={r.threshold_count} onChange={e=>updateRule(r.rule_key,{threshold_count:Number(e.target.value)})}/></label>
         <label><span>WINDOW</span><div className="risk-input-suffix"><input type="number" min={1} value={r.window_minutes} onChange={e=>updateRule(r.rule_key,{window_minutes:Number(e.target.value)})}/><em>min</em></div></label>
         <label><span>ACTION</span><select value={r.action||"FLAG"} onChange={e=>updateRule(r.rule_key,{action:e.target.value})}><option value="FLAG">Flag</option><option value="MONITOR">Monitor</option><option value="WITHDRAWAL_REVIEW">Withdrawal review</option><option value="FINANCIAL_RESTRICTION">Financial restriction</option></select></label>
        </div>
        <div className="risk-rule-footer"><code>{r.rule_key}</code><button className="risk-save" disabled={saving===r.rule_key} onClick={()=>saveRule(r)}><Save size={13}/>{saving===r.rule_key?"Saving…":"Save rule"}</button></div>
       </article>)}</div>
      </section>
    </div>}

    {section!=="overview"&&<section className="risk-card risk-list-card">
      <div className="risk-card-heading"><div><span>{selected?.[1].toUpperCase()}</span><h3>{selected?.[1]}</h3><p>{selected?.[2]} signals collected by the central risk and compliance engine.</p></div><div className="risk-tools"><div className="risk-search"><Filter size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search this view"/></div><span className="risk-count">{filtered.length} shown</span></div></div>
      {loading?<div className="risk-empty"><RefreshCw className="risk-spin" size={20}/><span>Loading intelligence…</span></div>:filtered.length?<div className="risk-table">
       <div className="risk-table-head"><span>USER / SIGNAL</span><span>RISK</span><span>DETAIL</span><span>ACTION</span></div>
       {filtered.map((x:any,i:number)=><div className="risk-table-row" key={x.case_id||x.id||x.user_id||x.cluster_key||x.zpa_id||i}>
        <div className="risk-person"><span className="risk-avatar">{String(x.full_name||x.referrer_name||x.zpa_name||x.address_masked||x.bank_name||"R").slice(0,1).toUpperCase()}</span><span><b>{x.full_name||x.referrer_name||x.zpa_name||x.address_masked||x.bank_name||"Risk signal"}</b><small>{x.email||x.cluster_key||x.flag_type||x.status||"Central risk signal"}</small></span></div>
        <strong className={"risk-badge "+String(x.classification||x.severity||"").toLowerCase()}>{x.score!==undefined?Number(x.score)+"/100":x.risk_score!==undefined?"Risk "+x.risk_score:x.severity||"Signal"}</strong>
        <span className="risk-detail">{x.reason||x.description||x.action||x.user_count?((x.user_count?x.user_count+" users":x.description)||x.reason||x.action):x.referral_count?x.referral_count+" referrals":x.acquisition_count?x.acquisition_count+" acquisitions":x.gross_amount?money(x.gross_amount):"Review signal"}</span>
        <div className="risk-row-actions">{x.case_id&&<><button className="risk-action secondary" disabled={saving===x.case_id} onClick={()=>resolve(x.case_id,"IN_REVIEW","MONITOR")}>Review</button><button className="risk-action" disabled={saving===x.case_id} onClick={()=>resolve(x.case_id,"RESOLVED","NONE")}>Clear</button></>}</div>
       </div>)}
      </div>:<div className="risk-empty"><CheckCircle2 size={22}/><b>No active signals</b><span>This section is clear right now.</span></div>}
    </section>}
   </main>
  </div>
 </section>
}
