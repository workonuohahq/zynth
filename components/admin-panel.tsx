"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowDownToLine,ArrowLeftRight,BarChart3,CheckCircle2,ChevronRight,Clock3,ExternalLink,Eye,RefreshCw,Settings2,ShieldCheck,TrendingUp,Users,X,XCircle} from "lucide-react";
import AdminUsers from "@/components/admin-users";
import ThemeSwitcher from "@/components/theme-switcher";
import AdminInvestmentSettings from "@/components/admin-investment-settings";
import AdminStrategyForm from "@/components/admin-strategy-form";
import AdminTraders from "@/components/admin-traders";

const money=(n:any)=>`₦${Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const pct=(n:any)=>`${Number(n||0).toFixed(2)}%`;

export default function AdminPanel({initialData,adminEmail}:{initialData:any;adminEmail:string}){
 const[data,setData]=useState(initialData||{}),[tab,setTab]=useState("overview"),[moneyOpen,setMoneyOpen]=useState(false),[reports,setReports]=useState<any[]>([]),[history,setHistory]=useState<any[]>([]),[strategies,setStrategies]=useState<any[]>([]),[traders,setTraders]=useState<any[]>([]),[busy,setBusy]=useState(""),[notice,setNotice]=useState(""),[preview,setPreview]=useState<any>(null),[previewBusy,setPreviewBusy]=useState(""),[editingStrategy,setEditingStrategy]=useState<any>(null);
 async function load(){
  const [q,s,t]=await Promise.all([
   fetch("/api/admin/settlements").then(r=>r.json()),
   fetch("/api/admin/strategies").then(r=>r.json()),
   fetch("/api/admin/traders").then(r=>r.json())
  ]);
  setReports(q.reports||[]);setHistory(q.history||[]);setStrategies(s.strategies||[]);setTraders(t.traders||[]);
 }
 useEffect(() => {
  load();
  const handleEditStrategy = (event:any) => setEditingStrategy(event.detail);
  window.addEventListener("zynth-edit-strategy", handleEditStrategy);
  return () => window.removeEventListener("zynth-edit-strategy", handleEditStrategy);
}, []);
 async function act(id:string,a:string){
  setBusy(id);setNotice("");
  let reason="";
  if(a==="reject")reason=window.prompt("Reason for rejection")||"Report rejected";
  const r=await fetch("/api/admin/settlements",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reportId:id,action:a,reason})});
  const j=await r.json();
  setNotice(r.ok?(a==="confirm"?"Settlement confirmed and investor NAV updated.":"Report rejected."):(j.error||"Action failed."));
  await load();setBusy("");
 }
 async function openPreview(id:string){
  setPreviewBusy(id);setNotice("");
  const r=await fetch("/api/admin/settlements",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reportId:id,action:"preview"})});
  const j=await r.json();
  if(!r.ok)setNotice(j.error||"Could not load settlement preview.");
  else setPreview(j);
  setPreviewBusy("");
 }
 const closePreview=()=>setPreview(null);
 return <div className="admin-frame">
  <aside className="admin-sidebar">
   <Link href="/dashboard" className="admin-brand"><span className="brand-mark">Z</span><span>ZYNTH</span><small>ADMIN</small></Link>
   <div className="admin-nav-label">CONTROL CENTER</div>
   <nav className="admin-list-nav">
    {[
      {k:"overview",l:"Overview",i:BarChart3,b:data.pending_reports},
      {k:"settlements",l:"Settlements",i:Clock3,b:data.pending_reports},
      {k:"strategies",l:"Strategies",i:TrendingUp,b:data.strategies},
      {k:"investors",l:"Investors",i:Users,b:data.investors},
      {k:"traders",l:"Traders",i:ShieldCheck,b:data.traders}
    ].map(({k,l,i:Icon,b})=><button key={k} className={tab===k?"admin-list-item active":"admin-list-item"} onClick={()=>setTab(k)}><span className="admin-list-icon"><Icon size={16}/></span><span className="admin-list-label">{l}</span>{b>0&&<em>{b}</em>}</button>)}
    <div className={"admin-money-nav "+(moneyOpen||["deposits","withdrawals","redemptions"].includes(tab)?"open":"")}>
      <button className={["deposits","withdrawals","redemptions"].includes(tab)?"admin-list-item active":"admin-list-item"} onClick={()=>setMoneyOpen(v=>!v)} aria-expanded={moneyOpen}>
        <span className="admin-list-icon"><ArrowLeftRight size={16}/></span><span className="admin-list-label">Money Movement</span><span className="admin-money-chevron"><ChevronRight size={13}/></span>
        {((Number(data.pending_deposits)||0)+(Number(data.withdrawals_pending)||0))>0&&<em>{(Number(data.pending_deposits)||0)+(Number(data.withdrawals_pending)||0)}</em>}
      </button>
      {(moneyOpen||["deposits","withdrawals","redemptions"].includes(tab))&&<div className="admin-money-subnav">
        <button className={tab==="deposits"?"active":""} onClick={()=>{setTab("deposits");setMoneyOpen(true)}}><ArrowDownToLine size={13}/><span>Deposits</span>{Number(data.pending_deposits||0)>0&&<b>{data.pending_deposits}</b>}</button>
        <button className={tab==="withdrawals"?"active":""} onClick={()=>{setTab("withdrawals");setMoneyOpen(true)}}><ArrowDownToLine size={13}/><span>Withdrawals</span>{Number(data.withdrawals_pending||0)>0&&<b>{data.withdrawals_pending}</b>}</button>
        <button className={tab==="redemptions"?"active":""} onClick={()=>{setTab("redemptions");setMoneyOpen(true)}}><ArrowDownToLine size={13}/><span>Redemptions</span></button>
      </div>}
    </div>
    <button className={tab==="settings"?"admin-list-item active":"admin-list-item"} onClick={()=>setTab("settings")}><span className="admin-list-icon"><Settings2 size={16}/></span><span className="admin-list-label">Settings</span></button>
   </nav>
   <div className="admin-sidebar-bottom"><span className="admin-session"><i/>Online</span><div className="admin-identity"><span className="avatar">A</span><span><b>Administrator</b><small>{adminEmail}</small></span></div></div>
  </aside>
  <main className="admin-main">
   <header className="admin-topbar"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ADMIN</span><span className="live-dot"><i/> CONTROL ONLINE</span></div><h1>{tab==="overview"?"Control center":tab.charAt(0).toUpperCase()+tab.slice(1)}</h1><p>Portfolio operations, strategy settlement and investor controls.</p></div><div className="admin-top-actions"><ThemeSwitcher/><button className="ghost admin-refresh" onClick={()=>location.reload()}><RefreshCw size={15}/> Refresh</button></div></header>
   {notice&&<div className="admin-notice">{notice}</div>}

   {tab==="overview"&&<section className="admin-section"><div className="admin-kpis">{[[TrendingUp,"AUM",money(data.aumm),"PORTFOLIO"],[Users,"Investors",data.investors,"ACCOUNTS"],[ShieldCheck,"Traders",data.traders,"OPERATORS"],[Clock3,"Pending reports",data.pending_reports,"ACTION"],[ArrowDownToLine,"Withdrawals",data.withdrawals_pending,"ACTION"]].map(([Icon,label,val,tag]:any)=><div className="admin-kpi" key={label}><div className="admin-kpi-top"><span className="admin-kpi-icon"><Icon size={16}/></span><em>{tag}</em></div><small>{label}</small><b>{val}</b></div>)}</div><section className="admin-card admin-feature-card"><div className="admin-card-head"><div><span className="muted">SETTLEMENT QUEUE</span><h2>What needs attention</h2><p>Trader reports do not change investor balances until an administrator confirms them.</p></div><button className="text-action" onClick={()=>setTab("settlements")}>Open queue <ChevronRight size={13}/></button></div><div className="admin-table">{(data.pending_report_queue||[]).slice(0,6).map((r:any)=><div className="admin-row" key={r.id}><div className="admin-person"><span className="avatar">T</span><span><b>{r.strategy_name}</b><small>{r.trader_name||"Trader"} · {new Date(r.report_date).toLocaleDateString("en-NG")}</small></span></div><span>{money(r.closing_balance)}</span><span>{pct(r.return_pct)}</span><strong>Pending</strong></div>)}{!data.pending_report_queue?.length&&<div className="admin-empty"><CheckCircle2 size={22}/><p>No settlement reports waiting.</p></div>}</div></section></section>}

   {tab==="settlements"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">DAILY VERIFICATION</span><h2>Settlement queue</h2><p>Review the complete NAV and investor impact before confirming a report.</p></div><span className="admin-count">{reports.length} pending</span></div><div className="admin-table">{reports.map(r=><div className="admin-row settlement-row" key={r.id}><div className="admin-person"><span className="avatar">T</span><span><b>{r.strategy_name}</b><small>{r.trader_name||r.trader_email} · {new Date(r.report_date).toLocaleDateString("en-NG")}</small></span></div><span>Open {money(r.opening_balance)}</span><span>Close {money(r.closing_balance)}</span><strong>{pct(r.return_pct)}</strong><div className="row-actions"><button className="details" disabled={previewBusy===r.id} onClick={()=>openPreview(r.id)}><Eye size={14}/> {previewBusy===r.id?"Reviewing":"Review"}</button><button className="approve" disabled={busy===r.id} onClick={()=>act(r.id,"confirm")}><CheckCircle2 size={14}/> Confirm</button><button className="reject" disabled={busy===r.id} onClick={()=>act(r.id,"reject")}><XCircle size={14}/> Reject</button></div></div>)}{!reports.length&&<div className="admin-empty"><CheckCircle2 size={22}/><p>Settlement queue is clear.</p></div>}</div></section><section className="admin-card settlement-history-card"><div className="admin-card-head"><div><span className="muted">AUDIT HISTORY</span><h2>Recent settlements</h2><p>Confirmed settlements are immutable. A reversal creates an audit trail and restores the prior NAV state.</p></div><span className="admin-count">{history.length}</span></div><div className="admin-table">{history.map((s:any)=><div className="admin-row settlement-row" key={s.id}><div className="admin-person"><span className="avatar">S</span><span><b>{s.strategy_name}</b><small>{new Date(s.settlement_date).toLocaleDateString("en-NG")} · {s.trader_name||s.trader_email||"Trader"}</small></span></div><span>NAV {Number(s.previous_nav||0).toFixed(2)} → {Number(s.nav||0).toFixed(2)}</span><strong>{pct(s.return_pct)}</strong><span className={s.status==="reversed"?"status-reversed":"status-settled"}>{s.status}</span>{s.status==="settled"&&<button className="details" onClick={()=>{const reason=window.prompt("Explain why this settlement must be reversed (minimum 10 characters).");if(reason&&reason.trim().length>=10){setBusy(s.id);fetch("/api/admin/settlements",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"reverse",settlementId:s.id,reason})}).then(async r=>{const j=await r.json();setNotice(r.ok?"Settlement reversed and prior NAV restored.":(j.error||"Reversal failed."));await load();setBusy("")})}}} disabled={busy===s.id}>Correct</button>}</div>)}{!history.length&&<div className="admin-empty"><Clock3 size={22}/><p>No completed settlements yet.</p></div>}</div></section></section>}

   {tab==="strategies"&&<section className="admin-section"><AdminStrategyForm traders={traders} onSaved={()=>{setEditingStrategy(null);load()}} editStrategy={editingStrategy} onCancel={()=>setEditingStrategy(null)}/><section className="admin-card"><div className="admin-card-head"><div><span className="muted">STRATEGY BOOK · ADMIN CRUD</span><h2>Strategy control</h2><p>Create, inspect, edit, pause, archive and—only when financially unused—delete strategies. Accounting history is protected.</p></div><span className="admin-count">{strategies.length} strategies</span></div><div className="admin-table">{strategies.map(s=><div className="admin-row" key={s.id}><div className="admin-person"><span className="avatar">S</span><span><b>{s.name}</b><small>{s.trader_name||"Unassigned"} · NAV {Number(s.nav||0).toFixed(2)}</small></span></div><span>Min {money(s.minimum_investment)}</span><strong className={"status-text "+s.status}>{s.status.replace("_"," ")}</strong><div className="row-actions"><button className="details" onClick={()=>window.dispatchEvent(new CustomEvent("zynth-edit-strategy",{detail:s}))}>Edit</button>{s.status==="pending_review"&&<button className="approve" onClick={async()=>{const r=await fetch("/api/admin/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve",strategyId:s.id,name:s.name,description:s.description,traderId:s.trader_id,startingBalance:s.starting_balance,minimumInvestment:s.minimum_investment,maximumInvestment:s.maximum_investment})});const j=await r.json();setNotice(r.ok?"Strategy approved and published.":j.error||"Approval failed.");await load()}}>Approve</button>}{s.status==="active"&&<button className="ghost" onClick={async()=>{const r=await fetch("/api/admin/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"pause",strategyId:s.id,name:s.name,description:s.description,traderId:s.trader_id,startingBalance:s.starting_balance,minimumInvestment:s.minimum_investment,maximumInvestment:s.maximum_investment});const j=await r.json();setNotice(r.ok?"Strategy paused.":j.error||"Pause failed.");await load()}}>Pause</button>}{s.status==="paused"&&<button className="approve" onClick={async()=>{const r=await fetch("/api/admin/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve",strategyId:s.id,name:s.name,description:s.description,traderId:s.trader_id,startingBalance:s.starting_balance,minimumInvestment:s.minimum_investment,maximumInvestment:s.maximum_investment});const j=await r.json();setNotice(r.ok?"Strategy activated.":j.error||"Activation failed.");await load()}}>Activate</button>}{s.status!=="archived"&&<button className="reject" onClick={async()=>{if(!confirm("Archive this strategy? Active investors will block this action."))return;const r=await fetch("/api/admin/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"archive",strategyId:s.id,name:s.name,description:s.description,traderId:s.trader_id,startingBalance:s.starting_balance,minimumInvestment:s.minimum_investment,maximumInvestment:s.maximum_investment});const j=await r.json();setNotice(r.ok?"Strategy archived.":j.error||"Archive failed.");await load()}}>Archive</button>}{s.status==="pending_review"&&<button className="reject" onClick={async()=>{if(!confirm("Delete this unused strategy permanently?"))return;const r=await fetch("/api/admin/strategies",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"delete",strategyId:s.id}));const j=await r.json();setNotice(r.ok?"Strategy deleted.":j.error||"Delete blocked.");await load()}}>Delete</button>}</div></div>)}{!strategies.length&&<div className="admin-empty"><TrendingUp size={22}/><p>No strategies published.</p></div>}</div></section></section>}

   {tab==="investors"&&<section className="admin-section"><section className="admin-card admin-users-card"><div className="admin-card-head"><div><span className="muted">INVESTOR DIRECTORY</span><h2>Investors</h2><p>Account status and portfolio controls.</p></div></div><AdminUsers initialUsers={[]}/></section></section>}

   {tab==="traders"&&<AdminTraders onSaved={load}/>} 

   {tab==="deposits"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">MONEY MOVEMENT</span><h2>Deposit operations</h2><p>Review and confirm incoming payment requests. Strategy-linked deposits activate an investment directly and never become spendable cash.</p></div><Link className="text-action" href="/admin/deposits">Open deposit queue <ChevronRight size={13}/></Link></div></section></section>}
   {tab==="withdrawals"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">MONEY MOVEMENT</span><h2>Withdrawal operations</h2><p>Existing withdrawal controls remain available while profit eligibility is enforced by the Vault layer.</p></div><Link className="text-action" href="/admin/withdrawals">Open queue <ChevronRight size={13}/></Link></div></section></section>}
   {tab==="redemptions"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">INVESTMENT LIQUIDITY</span><h2>Investor exits</h2><p>Redemptions are unit-based, NAV-priced and released only after the configured approval and delay rules.</p></div><Link className="text-action" href="/admin/redemptions">Open redemption control <ChevronRight size={13}/></Link></div></section></section>}

   {tab==="settings"&&<section className="admin-section"><section className="admin-card settings-card"><div className="admin-card-head"><div><span className="muted">SYSTEM RULES</span><h2>Settlement & Vault controls</h2><p>Configure the investor engine, profit lock and operating thresholds. Changes are audited.</p></div></div><AdminInvestmentSettings/><div className="rule-list" style={{marginTop:20}}><div><span>Settlement model</span><b>Trader report → admin confirm → NAV</b></div><div><span>MT5 automation</span><b>Removed</b></div></div></section></section>}
  </main>

  {preview&&<div className="settlement-modal-backdrop" role="presentation" onMouseDown={closePreview}><section className="settlement-modal" role="dialog" aria-modal="true" aria-label="Settlement preview" onMouseDown={e=>e.stopPropagation()}>
   <header className="settlement-modal-head"><div><span className="muted">SETTLEMENT PREVIEW</span><h2>{preview.strategy?.name}</h2><p>{new Date(preview.report?.report_date).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"})} · {preview.trader?.name||preview.trader?.email||"Trader"}</p></div><button className="icon-button" onClick={closePreview} aria-label="Close preview"><X size={17}/></button></header>
   <div className="settlement-summary-grid">
    <div><span>Trading P/L</span><b>{money(preview.report?.trading_pnl)}</b></div><div><span>Daily return</span><b>{pct(preview.report?.return_pct)}</b></div><div><span>NAV before</span><b>{Number(preview.strategy?.nav_before||0).toFixed(4)}</b></div><div><span>NAV after</span><b>{Number(preview.strategy?.nav_after||0).toFixed(4)}</b></div>
   </div>
   <div className="settlement-flow"><div><span>Opening</span><b>{money(preview.report?.opening_balance)}</b></div><ChevronRight size={15}/><div><span>Closing</span><b>{money(preview.report?.closing_balance)}</b></div></div>
   <div className="settlement-meta"><div><span>External deposits</span><b>{money(preview.report?.external_deposit)}</b></div><div><span>External withdrawals</span><b>{money(preview.report?.external_withdrawal)}</b></div><div><span>Positions flat</span><b>{preview.report?.positions_flat?"Yes":"No"}</b></div><div><span>Evidence</span>{preview.report?.evidence_url?<a href={preview.report.evidence_url} target="_blank" rel="noreferrer">Open evidence <ExternalLink size={12}/></a>:<b>Not provided</b>}</div></div>
   <div className="settlement-impact"><div><span>Investor value before</span><b>{money(preview.investor_value_before)}</b></div><div><span>Investor value after</span><b>{money(preview.investor_value_after)}</b></div><div><span>Total change</span><b>{money(preview.investor_value_change)}</b></div></div>
   <div className="settlement-investors"><div className="settlement-section-title"><span>INVESTOR IMPACT</span><b>{preview.investors?.length||0} active positions</b></div>{(preview.investors||[]).map((i:any)=><div className="settlement-investor-row" key={i.investment_id}><div><b>{i.investor_name}</b><small>{Number(i.units||0).toFixed(4)} units · Principal {money(i.principal)}</small></div><span><b>{money(i.current_value_after)}</b><small className={Number(i.change)>=0?"amount-positive":""}>{Number(i.change)>=0?"+":""}{money(i.change)}</small></span></div>)}{!preview.investors?.length&&<div className="admin-empty">No active investors on this strategy.</div>}</div>
   {preview.report?.note&&<div className="settlement-note"><span>TRADER NOTE</span><p>{preview.report.note}</p></div>}
   <footer className="settlement-modal-actions"><button className="ghost" onClick={closePreview}>Close</button><button className="reject" disabled={busy===preview.report?.id} onClick={()=>{closePreview();act(preview.report.id,"reject")}}><XCircle size={14}/> Reject</button><button className="approve" disabled={busy===preview.report?.id} onClick={()=>{closePreview();act(preview.report.id,"confirm")}}><CheckCircle2 size={14}/> Confirm settlement</button></footer>
  </section></div>}
 </div>
}