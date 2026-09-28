"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowLeftRight,CheckCircle2,Clock3,RefreshCw,Search,ShieldCheck,X,XCircle,Zap,WalletCards,AlertCircle,CalendarClock,ChevronRight} from "lucide-react";

const money=(n:any)=>"₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
const dt=(v:any)=>v?new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"—";
const dateOnly=(v:any)=>v?new Date(v).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—";
const statusLabel=(s:string)=>({pending:"Awaiting review",approved:"Approved",processing:"Processing",released:"Released",rejected:"Rejected",cancelled:"Cancelled"}[s]||s);
const active=(s:string)=>["pending","approved","processing"].includes(s);
const statusTone=(s:string)=>({pending:"amber",approved:"gold",processing:"blue",released:"green",rejected:"red",cancelled:"muted"}[s]||"muted");

export default function AdminRedemptions(){
 const[rows,setRows]=useState<any[]>([]);
 const[busy,setBusy]=useState("");
 const[notice,setNotice]=useState("");
 const[query,setQuery]=useState("");
 const[filter,setFilter]=useState("active");
 const[selected,setSelected]=useState<any>(null);
 const[loading,setLoading]=useState(true);

 async function load(){
  setLoading(true);
  try{
   const r=await fetch("/api/admin/redemptions",{cache:"no-store"});
   const d=await r.json();
   if(r.ok)setRows(d.redemptions||[]);
   else setNotice(d.error||"Unable to load redemptions.");
  }catch{setNotice("Unable to connect to the redemption service.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{load()},[]);

 async function act(id:string,action:string){
  setBusy(id);setNotice("");
  let reason="";
  if(action==="reject"){
   reason=window.prompt("Reason for rejecting this redemption:")||"Redemption rejected";
   if(!reason.trim()){setBusy("");return;}
  }
  try{
   const r=await fetch("/api/admin/redemptions/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({redemptionId:id,action,reason})});
   const d=await r.json();
   setNotice(r.ok?"Redemption action completed.":(d.error||"Action failed."));
   await load();
   if(r.ok)setSelected(null);
  }catch{setNotice("Action could not be completed. Please retry.");}
  finally{setBusy("");}
 }

 const metrics=useMemo(()=>{
  const activeRows=rows.filter(r=>active(r.status));
  const pending=rows.filter(r=>r.status==="pending");
  const net=activeRows.reduce((a,r)=>a+Number(r.net_amount||0),0);
  const gross=activeRows.reduce((a,r)=>a+Number(r.gross_amount||0),0);
  const releases=activeRows.map(r=>r.release_at?new Date(r.release_at).getTime():Infinity).filter(Number.isFinite);
  return {active:activeRows.length,pending:pending.length,net,gross,next:releases.length?new Date(Math.min(...releases)).getTime():null};
 },[rows]);

 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase();
  return rows.filter(r=>{
   const matchesFilter=filter==="all"||(filter==="active"&&active(r.status))||r.status===filter;
   const hay=[r.full_name,r.email,r.strategy_name,r.reference,r.status].join(" ").toLowerCase();
   return matchesFilter&&(!q||hay.includes(q));
  });
 },[rows,filter,query]);

 const actionLabel=(r:any)=>{
  if(r.status==="pending")return {label:"Approve",action:"approve",icon:CheckCircle2,kind:"approve"};
  if(r.status==="approved")return {label:"Mark processing",action:"processing",icon:Clock3,kind:"details"};
  if(r.status==="processing")return {label:"Release now",action:"release",icon:Zap,kind:"approve"};
  return null;
 };

 return <section className="admin-redemptions-page">
  <header className="admin-redemptions-header">
   <div>
    <div className="eyebrow-row"><span className="eyebrow">ZYNTH / MONEY MOVEMENT</span><span className="live-dot"><i/> LIQUIDITY CONTROL</span></div>
    <h1>Investment redemptions</h1>
    <p>Review investor exits, validate the release path, and keep every unit movement auditable.</p>
   </div>
   <div className="admin-redemptions-header-actions"><Link className="ghost admin-back-dashboard" href="/admin" aria-label="Back to main admin dashboard"><ArrowLeft size={15}/> Back to dashboard</Link><button className="ghost admin-refresh" onClick={load} disabled={loading}><RefreshCw size={15} className={loading?"spin":""}/>{loading?"Refreshing…":"Refresh queue"}</button></div>
  </header>

  {notice&&<div className="admin-notice"><AlertCircle size={14}/>{notice}</div>}

  <section className="redemption-command-strip">
   <div className="redemption-metric"><span><Clock3 size={14}/> NEEDS REVIEW</span><b>{metrics.pending}</b><small>Requests awaiting an admin decision</small></div>
   <div className="redemption-metric"><span><ArrowLeftRight size={14}/> ACTIVE PIPELINE</span><b>{metrics.active}</b><small>Approved, processing or awaiting release</small></div>
   <div className="redemption-metric"><span><WalletCards size={14}/> NET RELEASE VALUE</span><b>{money(metrics.net)}</b><small>Current active redemption liability</small></div>
   <div className="redemption-metric"><span><CalendarClock size={14}/> NEXT RELEASE</span><b>{metrics.next?new Date(metrics.next).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}):"—"}</b><small>{metrics.next?dateOnly(metrics.next):"No scheduled release"}</small></div>
  </section>

  <section className="admin-card redemption-queue-card">
   <div className="redemption-queue-head">
    <div><span className="muted">CONTROL QUEUE</span><h2>Investor exit pipeline</h2><p>Every request is priced in units at the recorded NAV. Review before moving funds toward release.</p></div>
    <div className="redemption-integrity"><ShieldCheck size={15}/><span><b>Accounting protected</b><small>Unit-based settlement</small></span></div>
   </div>

   <div className="redemption-toolbar">
    <div className="redemption-filters" role="tablist" aria-label="Redemption filters">
     {[["active","Active"],["pending","Needs review"],["approved","Approved"],["processing","Processing"],["all","All"]].map(([key,label])=><button key={key} className={filter===key?"active":""} onClick={()=>setFilter(key)}>{label}{key==="active"&&<em>{metrics.active}</em>}{key==="pending"&&<em>{metrics.pending}</em>}</button>)}
    </div>
    <label className="redemption-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search investor, strategy or reference" aria-label="Search redemptions"/></label>
   </div>

   <div className="redemption-table">
    <div className="redemption-table-head"><span>INVESTOR / REFERENCE</span><span>POSITION</span><span>VALUE</span><span>RELEASE</span><span>STATUS</span><span></span></div>
    {loading?<div className="redemption-loading"><RefreshCw size={18} className="spin"/><span>Loading redemption queue…</span></div>:
     filtered.map(r=>{
      const action=actionLabel(r);const ActionIcon=action?.icon;
      return <div className="redemption-row" key={r.id} onClick={()=>setSelected(r)}>
       <div className="redemption-investor"><span className="redemption-avatar"><WalletCards size={15}/></span><span><b>{r.full_name||"Investor"}</b><small>{r.email||"—"}</small><small className="redemption-ref">{r.reference}</small></span></div>
       <div><b>{r.strategy_name||"Strategy"}</b><small>{Number(r.requested_units||0).toFixed(6)} units · NAV {Number(r.nav||0).toFixed(4)}</small></div>
       <div><b>{money(r.net_amount)}</b><small>Gross {money(r.gross_amount)}</small></div>
       <div><b>{r.release_at?dateOnly(r.release_at):"Immediate"}</b><small>{r.release_at?new Date(r.release_at).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"}):"No delay"}</small></div>
       <div><span className={"redemption-status "+statusTone(r.status)}><i/>{statusLabel(r.status)}</span>{r.status==="approved"&&<small>Awaiting release</small>}</div>
       <div className="redemption-row-action">{action&&ActionIcon&&<button className={action.kind} disabled={busy===r.id} onClick={e=>{e.stopPropagation();act(r.id,action.action)}}>{busy===r.id?<RefreshCw size={13} className="spin"/>:<ActionIcon size={13}/>}<span>{action.label}</span></button>}<button className="redemption-open" onClick={e=>{e.stopPropagation();setSelected(r)}} aria-label={"Open "+r.reference}><ChevronRight size={16}/></button></div>
      </div>
     })}
    {!loading&&!filtered.length&&<div className="admin-empty"><WalletCards size={22}/><p>{rows.length?"No redemptions match this view.":"No redemption requests yet."}</p></div>}
   </div>
  </section>

  {selected&&<div className="redemption-drawer-backdrop" onMouseDown={()=>setSelected(null)}><aside className="redemption-drawer" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}>
   <header><div><span className="muted">REDEMPTION REVIEW</span><h2>{selected.reference}</h2><p>{dateOnly(selected.requested_at)} · {dt(selected.requested_at).split(", ").slice(1).join(", ")}</p></div><button className="icon-button" onClick={()=>setSelected(null)} aria-label="Close review"><X size={17}/></button></header>
   <div className={"redemption-detail-status "+statusTone(selected.status)}><span><i/>{statusLabel(selected.status)}</span><small>{selected.status==="pending"?"Administrator decision required":selected.status==="approved"?"Approved — waiting for release window":selected.status==="processing"?"Processing toward investor release":selected.status==="released"?"Funds released":"Terminal state"}</small></div>

   <section className="redemption-detail-hero"><div><span>NET PAYOUT</span><b>{money(selected.net_amount)}</b><small>Gross {money(selected.gross_amount)} · Fee {money(selected.fee_amount)}</small></div><div><span>REQUESTED UNITS</span><b>{Number(selected.requested_units||0).toFixed(6)}</b><small>NAV {Number(selected.nav||0).toFixed(4)}</small></div></section>

   <div className="redemption-detail-grid">
    <div><span>INVESTOR</span><b>{selected.full_name||"Investor"}</b><small>{selected.email||"—"}</small></div>
    <div><span>STRATEGY</span><b>{selected.strategy_name||"Strategy"}</b><small>Investment exit</small></div>
    <div><span>REQUESTED</span><b>{dt(selected.requested_at)}</b><small>Submitted by investor</small></div>
    <div><span>RELEASE</span><b>{selected.release_at?dt(selected.release_at):"Immediate"}</b><small>{selected.released_at?"Released "+dt(selected.released_at):"Configured release point"}</small></div>
   </div>

   <section className="redemption-timeline"><div className={selected.status!=="pending"?"done":""}><span>1</span><div><b>Request submitted</b><small>{dt(selected.requested_at)}</small></div></div><div className={["approved","processing","released"].includes(selected.status)?"done":""}><span>2</span><div><b>Admin approval</b><small>{selected.approved_at?dt(selected.approved_at):"Awaiting review"}</small></div></div><div className={["processing","released"].includes(selected.status)?"done":""}><span>3</span><div><b>Processing</b><small>{selected.processing_at?dt(selected.processing_at):"Not started"}</small></div></div><div className={selected.status==="released"?"done":""}><span>4</span><div><b>Funds released</b><small>{selected.released_at?dt(selected.released_at):selected.release_at?"Scheduled "+dt(selected.release_at):"Pending"}</small></div></div></section>

   <section className="redemption-integrity-panel"><ShieldCheck size={15}/><div><b>Unit accounting safeguard</b><p>This request is tied to {Number(selected.requested_units||0).toFixed(6)} units at NAV {Number(selected.nav||0).toFixed(4)}. Administrative actions use the protected redemption workflow.</p></div></section>

   <footer className="redemption-drawer-actions">
    <button className="ghost" onClick={()=>setSelected(null)}>Close</button>
    {selected.status==="pending"&&<button className="reject" disabled={busy===selected.id} onClick={()=>act(selected.id,"reject")}><XCircle size={14}/> Reject</button>}
    {selected.status==="pending"&&<button className="approve" disabled={busy===selected.id} onClick={()=>act(selected.id,"approve")}><CheckCircle2 size={14}/> Approve</button>}
    {selected.status==="approved"&&<button className="details" disabled={busy===selected.id} onClick={()=>act(selected.id,"processing")}><Clock3 size={14}/> Mark processing</button>}
    {selected.status==="processing"&&<button className="approve" disabled={busy===selected.id} onClick={()=>act(selected.id,"release")}><Zap size={14}/> Release now</button>}
   </footer>
  </aside></div>}
 </section>
}
