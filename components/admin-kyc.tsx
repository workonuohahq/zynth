"use client";

import {useEffect, useMemo, useState} from "react";\nimport Link from "next/link";
import {
  Search, ShieldCheck, ShieldAlert, RefreshCw, ChevronRight, X,
  UserRound, FileCheck2, MapPin, WalletCards, ScanFace, History,
  AlertTriangle, CheckCircle2, Clock3, Ban, MoreHorizontal
} from "lucide-react";

const statuses=["ALL","NOT_STARTED","PENDING","IN_REVIEW","VERIFIED","REJECTED","EXPIRED","REVERIFICATION_REQUIRED","SUSPENDED"];
const risks=["ALL","LOW","MEDIUM","HIGH","CRITICAL"];

const statusMeta:any={
  NOT_STARTED:{label:"Not started",tone:"neutral",icon:Clock3},
  PENDING:{label:"Pending",tone:"gold",icon:Clock3},
  IN_REVIEW:{label:"In review",tone:"gold",icon:ScanFace},
  VERIFIED:{label:"Verified",tone:"green",icon:CheckCircle2},
  REJECTED:{label:"Rejected",tone:"red",icon:Ban},
  EXPIRED:{label:"Expired",tone:"red",icon:AlertTriangle},
  REVERIFICATION_REQUIRED:{label:"Reverification",tone:"gold",icon:AlertTriangle},
  SUSPENDED:{label:"Suspended",tone:"red",icon:Ban}
};

function Badge({value,risk=false}:{value:string;risk?:boolean}){
  const key=String(value||"").toUpperCase();
  const m=risk ? {label:key,tone:key==="CRITICAL"||key==="HIGH"?"red":key==="MEDIUM"?"gold":"green",icon:key==="CRITICAL"||key==="HIGH"?ShieldAlert:ShieldCheck} : (statusMeta[key]||{label:key,tone:"neutral",icon:Clock3});
  const Icon=m.icon;
  return <span className={"kyc-badge "+m.tone}><Icon size={12}/>{m.label.replaceAll("_"," ")}</span>;
}

function initials(name:string){
  return (name||"U").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase();
}

export default function AdminKyc(){
  const[rows,setRows]=useState<any[]>([]);
  const[q,setQ]=useState("");
  const[status,setStatus]=useState("ALL");
  const[risk,setRisk]=useState("ALL");
  const[sel,setSel]=useState<string|null>(null);
  const[detail,setDetail]=useState<any>(null);
  const[busy,setBusy]=useState("");
  const[notice,setNotice]=useState("");
  const[tab,setTab]=useState<"overview"|"identity"|"documents"|"aml"|"history">("overview");

  async function load(){
    setBusy("load");
    try{
      const p=new URLSearchParams();
      if(q)p.set("q",q);
      if(status!=="ALL")p.set("status",status);
      if(risk!=="ALL")p.set("risk",risk);
      const r=await fetch("/api/admin/kyc?"+p,{cache:"no-store"});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Unable to load KYC records.");
      setRows(j.items||[]);
    }catch(e:any){setNotice(e.message||"Unable to load KYC records.");}
    finally{setBusy("");}
  }

  async function open(id:string){
    setSel(id);setDetail(null);setTab("overview");
    const r=await fetch("/api/admin/kyc/"+id,{cache:"no-store"});
    const j=await r.json();
    if(!r.ok){setNotice(j.error||"Unable to open profile.");return}
    setDetail(j);
  }

  async function act(body:any){
    setBusy(body.action||"action");
    try{
      const r=await fetch("/api/admin/kyc",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json();
      setNotice(r.ok?"Compliance record updated.":j.error||"KYC update failed.");
      if(r.ok&&sel)await open(sel);
      await load();
    }catch(e:any){setNotice(e.message||"KYC update failed.");}
    finally{setBusy("");}
  }

  useEffect(()=>{load()},[]);

  const metrics=useMemo(()=>{
    const total=rows.length;
    const review=rows.filter(r=>["PENDING","IN_REVIEW","REVERIFICATION_REQUIRED"].includes(r.status)).length;
    const high=rows.filter(r=>["HIGH","CRITICAL"].includes(r.risk_classification)).length;
    const verified=rows.filter(r=>r.status==="VERIFIED").length;
    return {total,review,high,verified};
  },[rows]);

  return <section className="kyc-console">
    <style jsx>{`
      .kyc-console{--gold:#d6b36a;--gold2:#8e6a2d;--bg:#080808;--panel:#101010;--panel2:#141414;--line:#252525;--muted:#7e7e7e;color:#f5f5f5}
      .hero{position:relative;overflow:hidden;border:1px solid #3a3121;border-radius:22px;padding:28px;background:radial-gradient(circle at 85% 0%,#4a381955,transparent 38%),linear-gradient(135deg,#17130d,#0c0c0c 68%);margin-bottom:14px}
      .hero:after{content:"";position:absolute;width:180px;height:180px;border:1px solid #6b542f33;border-radius:50%;right:-65px;top:-80px;box-shadow:0 0 80px #8e6a2d22}
      .hero-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;position:relative;z-index:1}
      .eyebrow{font-size:9px;letter-spacing:.18em;color:#9a9a9a;font-weight:800}
      .hero h2{font-size:clamp(28px,4vw,42px);letter-spacing:-.055em;margin:9px 0 7px}
      .hero p{margin:0;color:#8b8b8b;font-size:12px;line-height:1.6;max-width:660px}
      .secure-mark{display:flex;align-items:center;gap:7px;color:#b9b9b9;font-size:10px;border:1px solid #34302a;background:#0d0d0d;padding:9px 11px;border-radius:999px;white-space:nowrap}
      .secure-mark svg{color:var(--gold)}
      .metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
      .metric{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;min-width:0}
      .metric-label{display:flex;align-items:center;gap:7px;color:#7d7d7d;font-size:10px;font-weight:700}
      .metric-label svg{color:var(--gold)}
      .metric strong{display:block;font-size:25px;letter-spacing:-.04em;margin-top:10px}
      .metric small{display:block;color:#555;margin-top:4px;font-size:9px}
      .workspace{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}
      .toolbar{padding:14px;border-bottom:1px solid var(--line);display:flex;gap:9px;align-items:center;flex-wrap:wrap}
      .search{display:flex;align-items:center;gap:9px;flex:1;min-width:240px;background:#0a0a0a;border:1px solid var(--line);border-radius:11px;padding:0 12px;height:42px}
      .search svg{color:#666;flex:none}.search input{background:transparent;border:0;outline:0;color:#fff;width:100%;font-size:12px}
      .filter{height:42px;background:#0a0a0a;border:1px solid var(--line);border-radius:11px;color:#aaa;padding:0 11px;font-size:11px;outline:none}
      .filter:focus{border-color:#5b4a2d}
      .toolbar button{height:42px}
      .notice{margin:12px 14px 0;padding:11px 12px;border-radius:10px;background:#17130d;border:1px solid #443821;color:#c9b07b;font-size:11px}
      .table-head,.kyc-row{display:grid;grid-template-columns:minmax(230px,1.7fr) 130px 120px 130px 34px;gap:16px;align-items:center}
      .table-head{padding:11px 18px;color:#555;text-transform:uppercase;letter-spacing:.12em;font-size:8px;font-weight:800;border-bottom:1px solid var(--line)}
      .kyc-row{width:100%;border:0;border-bottom:1px solid #1c1c1c;background:transparent;color:#eee;text-align:left;padding:14px 18px;transition:.15s}
      .kyc-row:hover{background:#15120d}.kyc-row:last-child{border-bottom:0}
      .identity{display:flex;align-items:center;gap:11px;min-width:0}
      .avatar{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;flex:none;background:linear-gradient(145deg,#2b2418,#141414);border:1px solid #443821;color:var(--gold);font-size:10px;font-weight:900}
      .identity b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .identity small{display:block;color:#666;font-size:9px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .level{font-size:10px;color:#aaa}.arrow{color:#555}
      .kyc-badge{display:inline-flex;align-items:center;gap:5px;width:max-content;max-width:100%;border-radius:999px;padding:6px 8px;border:1px solid #303030;font-size:8px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
      .kyc-badge.neutral{color:#888;background:#151515}.kyc-badge.gold{color:#d9b871;background:#241d10;border-color:#554421}.kyc-badge.green{color:#9fd0b0;background:#101d16;border-color:#274a37}.kyc-badge.red{color:#e6a4a4;background:#211313;border-color:#512c2c}
      .empty{padding:65px 20px;text-align:center;color:#666;font-size:12px}.empty svg{color:#5a4728;margin-bottom:12px}
      .drawer-backdrop{position:fixed;inset:0;background:#0009;z-index:80;backdrop-filter:blur(4px)}
      .drawer{position:fixed;z-index:81;top:0;right:0;height:100dvh;width:min(760px,100%);background:#0c0c0c;border-left:1px solid #353535;box-shadow:-30px 0 90px #000b;overflow:auto}
      .drawer-head{position:sticky;top:0;z-index:3;background:#0d0d0dee;backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:20px 22px}
      .drawer-head-top{display:flex;justify-content:space-between;gap:15px}.close{border:1px solid var(--line);background:#121212;width:34px;height:34px;border-radius:10px;display:grid;place-items:center}
      .case-id{color:#5f5f5f;font-size:8px;letter-spacing:.1em;margin-top:4px}
      .case-person{display:flex;align-items:center;gap:12px;margin-top:16px}
      .case-person .avatar{width:48px;height:48px}.case-person h3{font-size:20px;letter-spacing:-.035em;margin:0 0 5px}.case-person p{margin:0;color:#666;font-size:10px}
      .drawer-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:16px}.drawer-actions button,.risk-select{height:36px}
      .drawer-tabs{display:flex;gap:2px;padding:0 22px;border-bottom:1px solid var(--line);overflow:auto}
      .tab{flex:none;border:0;background:transparent;color:#666;padding:14px 11px;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid transparent}
      .tab.active{color:var(--gold);border-bottom-color:var(--gold)}
      .drawer-body{padding:18px 22px 40px}.section{border:1px solid var(--line);background:#101010;border-radius:15px;padding:16px;margin-bottom:11px}.section h4{margin:0 0 13px;font-size:12px}.section-title{display:flex;justify-content:space-between;gap:12px;align-items:center}.section-title span{color:#555;font-size:9px}
      .fact-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.fact{background:#0b0b0b;border:1px solid #1e1e1e;border-radius:10px;padding:11px;min-width:0}.fact span{display:block;color:#555;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.fact b{display:block;margin-top:6px;font-size:11px;line-height:1.45;word-break:break-word}
      .doc,.flag,.history{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-top:1px solid #1d1d1d;padding:12px 0}.doc:first-of-type,.flag:first-of-type,.history:first-of-type{border-top:0}
      .doc b,.flag b,.history b{font-size:10px}.doc small,.flag small,.history small{display:block;color:#666;font-size:8px;margin-top:4px;line-height:1.5}
      .row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.mini{border:1px solid var(--line);background:#151515;color:#aaa;border-radius:8px;padding:7px 9px;font-size:8px;font-weight:800}.mini.gold{color:var(--gold);border-color:#4d3d20}.mini.danger{color:#dc9b9b;border-color:#4b2929}
      .primary{border:0;background:var(--gold);color:#120e07;border-radius:9px;padding:9px 12px;font-weight:900;font-size:9px;display:inline-flex;align-items:center;gap:6px}
      .risk-select{background:#111;border:1px solid var(--line);color:#bbb;border-radius:9px;padding:0 9px;font-size:9px}
      .empty-inner{padding:28px 8px;text-align:center;color:#555;font-size:10px}
      @media(max-width:900px){.metric-grid{grid-template-columns:repeat(2,1fr)}.table-head,.kyc-row{grid-template-columns:minmax(220px,1.5fr) 105px 105px 34px}.table-head span:nth-child(3),.kyc-row>span:nth-child(3){display:none}}
      @media(max-width:650px){.hero{padding:20px}.hero-top{flex-direction:column}.secure-mark{display:none}.metric-grid{grid-template-columns:1fr 1fr}.metric{padding:13px}.metric strong{font-size:21px}.toolbar{padding:10px}.search{min-width:100%;order:1}.filter{flex:1;min-width:0}.table-head{display:none}.kyc-row{grid-template-columns:1fr auto;padding:14px}.kyc-row>span:nth-child(2),.kyc-row>span:nth-child(4){display:none}.drawer-head,.drawer-body{padding-left:16px;padding-right:16px}.drawer-tabs{padding:0 12px}.fact-grid{grid-template-columns:1fr}.drawer-actions .primary,.drawer-actions .mini{flex:1;justify-content:center}}
    `}</style>

    <div className="hero">
      <div className="hero-top">
        <div><div className="eyebrow">COMPLIANCE OPERATIONS</div><h2>KYC & AML Command Center</h2><p>Review identity, documents, source-of-funds evidence, screening results and compliance risk from one controlled workspace.</p></div>
        <div style={{display:"flex",gap:8,alignItems:"center",position:"relative",zIndex:1}}><Link href="/admin/kyc/forms" className="secure-mark"><FileCheck2 size={13}/> Form builder</Link><div className="secure-mark"><ShieldCheck size={13}/> Admin-only compliance workspace</div></div>
      </div>
    </div>

    <div className="metric-grid">
      <div className="metric"><div className="metric-label"><UserRound size={13}/>Cases in view</div><strong>{metrics.total}</strong><small>Matching current filters</small></div>
      <div className="metric"><div className="metric-label"><Clock3 size={13}/>Needs review</div><strong>{metrics.review}</strong><small>Pending, in review or reverification</small></div>
      <div className="metric"><div className="metric-label"><ShieldAlert size={13}/>Elevated risk</div><strong>{metrics.high}</strong><small>High + critical classifications</small></div>
      <div className="metric"><div className="metric-label"><CheckCircle2 size={13}/>Verified</div><strong>{metrics.verified}</strong><small>Verified in current result set</small></div>
    </div>

    <div className="workspace">
      <div className="toolbar">
        <div className="search"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} placeholder="Search name, email or user ID"/></div>
        <select className="filter" value={status} onChange={e=>{setStatus(e.target.value);setTimeout(load,0)}}><option value="ALL">All statuses</option>{statuses.slice(1).map(x=><option key={x}>{x.replaceAll("_"," ")}</option>)}</select>
        <select className="filter" value={risk} onChange={e=>{setRisk(e.target.value);setTimeout(load,0)}}>{risks.map(x=><option key={x}>{x==="ALL"?"All risk levels":x}</option>)}</select>
        <button className="ghost" onClick={load} disabled={busy==="load"}><RefreshCw size={14} className={busy==="load"?"spin":""}/>Refresh</button>
      </div>
      {notice&&<div className="notice">{notice}</div>}
      <div className="table-head"><span>Applicant</span><span>Verification</span><span>Level</span><span>Risk</span><span></span></div>
      {rows.length ? rows.map(r=><button key={r.user_id} className="kyc-row" onClick={()=>open(r.user_id)}>
        <span className="identity"><i className="avatar">{initials(r.full_name)}</i><span><b>{r.full_name||"Unnamed account"}</b><small>{r.email||r.user_id}</small></span></span>
        <span><Badge value={r.status}/></span><span className="level">{r.verification_level||"—"}</span><span><Badge value={r.risk_classification||"LOW"} risk/></span><ChevronRight className="arrow" size={16}/>
      </button>) : <div className="empty"><ShieldCheck size={26}/><div>No KYC cases match these filters.</div></div>}
    </div>

    {detail&&<><div className="drawer-backdrop" onClick={()=>setDetail(null)}/><aside className="drawer">
      <div className="drawer-head">
        <div className="drawer-head-top"><div><div className="eyebrow">KYC CASE</div><div className="case-id">{detail.user?.id}</div></div><button className="close" onClick={()=>setDetail(null)}><X size={16}/></button></div>
        <div className="case-person"><i className="avatar">{initials(detail.user?.full_name||detail.user?.email)}</i><div><h3>{detail.user?.full_name||"Unnamed account"}</h3><p>{detail.user?.email||"No email"} · {detail.profile?.country_of_residence||"Residence not supplied"}</p></div></div>
        <div className="drawer-actions">
          <button className="primary" disabled={!!busy} onClick={()=>act({action:"profile",userId:detail.user.id,kycAction:"APPROVED",status:"VERIFIED",reason:window.prompt("Reason / compliance note")||"Approved after compliance review"})}><CheckCircle2 size={12}/>Approve</button>
          <button className="mini danger" disabled={!!busy} onClick={()=>act({action:"profile",userId:detail.user.id,kycAction:"REJECTED",status:"REJECTED",reason:window.prompt("Rejection reason")||"Rejected after compliance review"})}><Ban size={12}/>Reject</button>
          <button className="mini" disabled={!!busy} onClick={()=>act({action:"profile",userId:detail.user.id,kycAction:"REQUESTED_INFORMATION",status:"IN_REVIEW",reason:window.prompt("Information requested")||"Additional information required"})}><MoreHorizontal size={12}/>Request info</button>
          <button className="mini danger" disabled={!!busy} onClick={()=>act({action:"profile",userId:detail.user.id,kycAction:"SUSPENDED",status:"SUSPENDED",reason:window.prompt("Suspension reason")||"Suspended by compliance"})}><Ban size={12}/>Suspend</button>
          <select className="risk-select" value={detail.profile?.risk_classification||"LOW"} onChange={e=>act({action:"profile",userId:detail.user.id,kycAction:"RISK_CHANGED",risk:e.target.value,reason:"Admin risk classification change"})}>{risks.slice(1).map(x=><option key={x}>{x}</option>)}</select>
        </div>
      </div>
      <div className="drawer-tabs">{[["overview","Overview",ShieldCheck],["identity","Identity",UserRound],["documents","Documents",FileCheck2],["aml","AML & screening",AlertTriangle],["history","History",History]].map(([key,label,Icon]:any)=><button key={key} className={"tab "+(tab===key?"active":"")} onClick={()=>setTab(key)}><Icon size={11}/> {label}</button>)}</div>
      <div className="drawer-body">
        {tab==="overview"&&<><div className="section"><div className="section-title"><h4>Case posture</h4><span>Current authoritative state</span></div><div className="fact-grid">
          <div className="fact"><span>Verification status</span><b><Badge value={detail.profile?.status||"NOT_STARTED"}/></b></div>
          <div className="fact"><span>Risk classification</span><b><Badge value={detail.profile?.risk_classification||"LOW"} risk/></b></div>
          <div className="fact"><span>Verification level</span><b>{detail.profile?.verification_level||"—"}</b></div>
          <div className="fact"><span>Country of residence</span><b>{detail.profile?.country_of_residence||"—"}</b></div>
        </div></div>
        <div className="section"><div className="section-title"><h4>Financial profile</h4><span>Declared by applicant</span></div><div className="fact-grid">
          <div className="fact"><span>Source of funds</span><b>{detail.profile?.source_of_funds||"—"}</b></div><div className="fact"><span>Funds review</span><b>{detail.profile?.source_of_funds_status||"—"}</b></div>
          <div className="fact"><span>Source of wealth</span><b>{detail.profile?.source_of_wealth||"—"}</b></div><div className="fact"><span>Wealth review</span><b>{detail.profile?.source_of_wealth_status||"—"}</b></div>
        </div></div>
        <div className="section"><div className="section-title"><h4>Attention signals</h4><span>{(detail.aml_flags||[]).filter((f:any)=>!["CLEARED","DISMISSED"].includes(f.status)).length} open</span></div>{(detail.aml_flags||[]).filter((f:any)=>!["CLEARED","DISMISSED"].includes(f.status)).slice(0,4).map((f:any)=><div className="flag" key={f.id}><span><b>{f.flag_type}</b><small>{f.description||"No description"}</small></span><Badge value={f.severity} risk/></div>)}{!(detail.aml_flags||[]).some((f:any)=>!["CLEARED","DISMISSED"].includes(f.status))&&<div className="empty-inner">No open AML flags.</div>}</div></>}
        {tab==="identity"&&<div className="section"><div className="section-title"><h4>Identity & address</h4><span>Applicant record</span></div><div className="fact-grid">
          <div className="fact"><span>Legal name</span><b>{[detail.profile?.legal_first_name,detail.profile?.legal_middle_name,detail.profile?.legal_last_name].filter(Boolean).join(" ")||"—"}</b></div>
          <div className="fact"><span>Date of birth</span><b>{detail.profile?.date_of_birth||"—"}</b></div><div className="fact"><span>Nationality</span><b>{detail.profile?.nationality||"—"}</b></div><div className="fact"><span>Residence</span><b>{detail.profile?.country_of_residence||"—"}</b></div>
        </div>{(detail.addresses||[]).map((a:any)=><div className="doc" key={a.id}><span><b><MapPin size={11} style={{verticalAlign:"-2px"}}/> {a.address_type}</b><small>{[a.line1,a.line2,a.city,a.state_region,a.postal_code,a.country].filter(Boolean).join(", ")||"No address supplied"}</small></span><Badge value={a.status||"PENDING"}/></div>)}</div>}
        {tab==="documents"&&<div className="section"><div className="section-title"><h4>Document verification</h4><span>{(detail.documents||[]).length} submitted</span></div>{(detail.documents||[]).map((d:any)=><div className="doc" key={d.id}><span><b>{String(d.document_type||"Document").replaceAll("_"," ")}</b><small>{d.verification_provider||"Manual"} · Expiry {d.expiration_date||"—"}</small></span><span className="row-actions"><Badge value={d.verification_status||"PENDING"}/><button className="mini gold" disabled={!!busy} onClick={()=>act({action:"document",documentId:d.id,status:"VERIFIED",provider:d.verification_provider||"MANUAL"})}>Verify</button><button className="mini danger" disabled={!!busy} onClick={()=>act({action:"document",documentId:d.id,status:"REJECTED",reason:window.prompt("Rejection reason")||"Rejected"})}>Reject</button></span></div>)}{!(detail.documents||[]).length&&<div className="empty-inner">No documents submitted.</div>}</div>}
        {tab==="aml"&&<><div className="section"><div className="section-title"><h4>AML flags</h4><button className="mini gold" onClick={()=>act({action:"aml_flag",userId:detail.user.id,flagType:"MANUAL_REVIEW",severity:"MEDIUM",description:window.prompt("AML flag description")||"Manual compliance review",source:"MANUAL"})}>Add flag</button></div>{(detail.aml_flags||[]).map((f:any)=><div className="flag" key={f.id}><span><b>{f.flag_type}</b><small>{f.description||"—"} · {f.source||"—"}</small></span><span className="row-actions"><Badge value={f.severity} risk/>{f.status!=="CLEARED"&&f.status!=="DISMISSED"&&<button className="mini gold" onClick={()=>act({action:"aml_resolve",flagId:f.id,status:"CLEARED",note:"Cleared by compliance review"})}>Clear</button>}</span></div>)}{!(detail.aml_flags||[]).length&&<div className="empty-inner">No AML flags.</div>}</div>
        <div className="section"><div className="section-title"><h4>Screening</h4><span>Manual control</span></div>{["PEP","SANCTIONS"].map(t=><div className="doc" key={t}><span><b>{t}</b><small>Record the latest screening decision and reviewer outcome.</small></span><span className="row-actions"><button className="mini gold" onClick={()=>act({action:"screening",userId:detail.user.id,type:t,result:"CLEAR",provider:"MANUAL",reviewStatus:"CLEAR",notes:"Manual clear"})}>Clear</button><button className="mini danger" onClick={()=>act({action:"screening",userId:detail.user.id,type:t,result:"POSSIBLE_MATCH",provider:"MANUAL",reviewStatus:"IN_REVIEW",notes:"Requires review"})}>Match</button></span></div>)}</div></>}
        {tab==="history"&&<div className="section"><div className="section-title"><h4>Review history</h4><span>Immutable audit trail</span></div>{(detail.history||[]).map((h:any)=><div className="history" key={h.id}><span><b>{String(h.action||"Review").replaceAll("_"," ")}</b><small>{h.reason||h.notes||"No note recorded"}</small></span><small>{h.from_status||"—"} → {h.to_status||"—"} · {h.created_at?new Date(h.created_at).toLocaleString("en-NG"):"—"}</small></div>)}{!(detail.history||[]).length&&<div className="empty-inner">No review history recorded.</div>}</div>}
      </div>
    </aside></>}
  </section>
}
