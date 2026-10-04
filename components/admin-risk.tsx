"use client";
import {useEffect,useState} from "react";
type Rule={rule_key:string;name:string;description?:string;enabled:boolean;points:number;threshold_count:number;window_minutes:number;action:string};
export default function AdminRisk(){
 const[d,setD]=useState<any>({}),[loading,setLoading]=useState(true),[filter,setFilter]=useState(""),[saving,setSaving]=useState(""),[notice,setNotice]=useState("");
 async function load(){setLoading(true);try{const r=await fetch("/api/admin/risk?limit=100",{cache:"no-store"});setD(await r.json())}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 async function resolve(id:string,status:string,action:string){const r=await fetch("/api/admin/risk",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"resolve",caseId:id,status,riskAction:action,note:"Admin risk review"})});if(!r.ok){const j=await r.json();setNotice(j.error||"Risk action failed.");return}await load()}
 async function saveRule(rule:Rule){
  setSaving(rule.rule_key);setNotice("");
  const r=await fetch("/api/admin/risk",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_rule",ruleKey:rule.rule_key,enabled:rule.enabled,points:rule.points,thresholdCount:rule.threshold_count,windowMinutes:rule.window_minutes,riskAction:rule.action})});
  const j=await r.json();setNotice(r.ok?"Risk rule updated.":j.error||"Could not update rule.");setSaving("");if(r.ok)await load();
 }
 const queue=(d.queue||[]).filter((x:any)=>!filter||x.classification===filter);
 return <section className="admin-section">
  <div className="admin-kpi-grid"><div className="admin-kpi"><span>CRITICAL</span><b>{d.critical||0}</b></div><div className="admin-kpi"><span>HIGH</span><b>{d.high||0}</b></div><div className="admin-kpi"><span>MEDIUM</span><b>{d.medium||0}</b></div><div className="admin-kpi"><span>OPEN REVIEWS</span><b>{d.open_reviews||0}</b></div></div>
  {notice&&<div className="admin-notice">{notice}</div>}
  <section className="admin-card"><div className="admin-card-head"><div><span className="muted">RISK & COMPLIANCE</span><h2>Behavioural risk queue</h2><p>Signals are evidence for review. Shared IP alone is never an automatic lock.</p></div><div style={{display:"flex",gap:8}}>{["","CRITICAL","HIGH","MEDIUM"].map(x=><button key={x} className={filter===x?"admin-filter active":"admin-filter"} onClick={()=>setFilter(x)}>{x||"ALL"}</button>)}</div></div>
  {loading?<div className="admin-empty">Loading risk queue…</div>:queue.length?<div className="admin-table"><div className="admin-table-head"><span>User</span><span>Risk</span><span>Flags</span><span>Action</span></div>{queue.map((x:any)=><div className="admin-table-row" key={x.id}><span><b>{x.full_name||x.email||x.user_id}</b><small>{x.email}</small></span><span><b>{x.classification}</b><small>{x.score}/100</small></span><span>{x.reason||"Risk engine case"}</span><span><button className="ghost" onClick={()=>resolve(x.id,"IN_REVIEW","MONITOR")}>Review</button><button className="ghost" onClick={()=>resolve(x.id,"RESOLVED","NONE")}>Clear</button></span></div>)}</div>:<div className="admin-empty">No open risk cases.</div>}</section>
  <section className="admin-card"><div className="admin-card-head"><div><span className="muted">POLICY ENGINE</span><h2>Risk rules</h2><p>Points, thresholds and windows are server-authoritative and audited.</p></div></div>
   <div className="admin-table">{(d.rules||[]).map((r:Rule)=><div className="admin-row" key={r.rule_key} style={{alignItems:"center"}}>
    <div className="admin-person"><span className="avatar">R</span><span><b>{r.name||r.rule_key}</b><small>{r.rule_key} · {r.description||"Configured behavioural signal"}</small></span></div>
    <label style={{display:"flex",gap:6,alignItems:"center"}}><input type="checkbox" checked={r.enabled} onChange={e=>setD((x:any)=>({...x,rules:(x.rules||[]).map((q:Rule)=>q.rule_key===r.rule_key?{...q,enabled:e.target.checked}:q)}))}/> Enabled</label>
    <label>Points <input style={{width:70}} type="number" min={0} max={100} value={r.points} onChange={e=>setD((x:any)=>({...x,rules:(x.rules||[]).map((q:Rule)=>q.rule_key===r.rule_key?{...q,points:Number(e.target.value)}:q)}))}/></label>
    <label>Count <input style={{width:70}} type="number" min={1} max={1000} value={r.threshold_count} onChange={e=>setD((x:any)=>({...x,rules:(x.rules||[]).map((q:Rule)=>q.rule_key===r.rule_key?{...q,threshold_count:Number(e.target.value)}:q)}))}/></label>
    <label>Window min <input style={{width:85}} type="number" min={1} max={43200} value={r.window_minutes} onChange={e=>setD((x:any)=>({...x,rules:(x.rules||[]).map((q:Rule)=>q.rule_key===r.rule_key?{...q,window_minutes:Number(e.target.value)}:q)}))}/></label>
    <select value={r.action} onChange={e=>setD((x:any)=>({...x,rules:(x.rules||[]).map((q:Rule)=>q.rule_key===r.rule_key?{...q,action:e.target.value}:q)}))}><option>FLAG</option><option>MONITOR</option><option>WITHDRAWAL_REVIEW</option><option>FINANCIAL_RESTRICTION</option></select>
    <button className="approve" disabled={saving===r.rule_key} onClick={()=>saveRule(r)}>{saving===r.rule_key?"Saving…":"Save"}</button>
   </div>)}</div>
  </section>
 </section>
}