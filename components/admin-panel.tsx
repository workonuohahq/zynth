"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminUsers from "@/components/admin-users";
import { ArrowDownToLine, ArrowLeft, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Gauge, RefreshCw, Settings2, ShieldCheck, Users, WalletCards, XCircle, type LucideIcon } from "lucide-react";

type AdminData = {
  settings?: { global_min_deposit:number; global_min_withdrawal?:number; current_yield_pct:number; exit_fee_pct:number; instant_commission_pct:number; deposits_enabled:boolean; withdrawals_enabled?:boolean; withdrawal_processing_notice?:string };
  users:number; funded_users:number; vaults_active:number; vaulted_principal:number; wallet_liquidity:number;
  pending_withdrawals:number; pending_withdrawal_amount:number; pending_deposits?:number; pending_deposit_amount?:number; zpa_agents:number; active_zpa_agents:number;
  recent_withdrawals:Array<any>; recent_users:Array<any>; zpa:Array<any>; audit:Array<any>;
};

const naira=(n:number)=>`₦${Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2})}`;
const date=(v:string)=>new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});

export default function AdminPanel({initialData,adminEmail}:{initialData:AdminData;adminEmail:string}) {
  const [data,setData]=useState(initialData);
  const [tab,setTab]=useState("overview");
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [queue,setQueue]=useState<any[]>(initialData.recent_withdrawals||[]);
  const [settings,setSettings]=useState({
    minDeposit:Number(data.settings?.global_min_deposit||5500),
    yieldPct:Number(data.settings?.current_yield_pct||0),
    exitFeePct:Number(data.settings?.exit_fee_pct||10),
    commissionPct:Number(data.settings?.instant_commission_pct||5),
    depositsEnabled:Boolean(data.settings?.deposits_enabled),
    minWithdrawal:Number(data.settings?.global_min_withdrawal||1000),
    withdrawalsEnabled:data.settings?.withdrawals_enabled!==false,
    withdrawalNotice:String(data.settings?.withdrawal_processing_notice||"Withdrawals are reviewed manually. Most requests are processed during normal operations.")
  });

  const refresh=async()=>{setBusy("refresh");setNotice("");try{location.reload()}finally{setBusy("")}};
  const saveSettings=async()=>{setBusy("settings");setNotice("");
    const r=await fetch("/api/admin/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings})});
    const j=await r.json(); if(!r.ok){setNotice(j.error||"Settings update failed.");setBusy("");return}
    setData({...data,settings:j.settings});setNotice("System settings updated.");setBusy("");
  };
  const loadQueue=async()=>{const r=await fetch("/api/admin/withdrawals");const j=await r.json();if(r.ok)setQueue(j.rows||[]);};
  const processWithdrawal=async(id:string,action:string)=>{
    if(action==="paid"&&!window.confirm("Confirm that this payout has actually been sent to the beneficiary account before marking it paid."))return; const reason=action==="reject"?window.prompt("Reason for rejecting this withdrawal:")||"Withdrawal rejected":null;
    setBusy(id);setNotice("");
    const r=await fetch("/api/admin/withdrawals/process",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({withdrawalId:id,action,reason})});
    const j=await r.json(); if(!r.ok){setNotice(j.error||"Unable to process withdrawal.");setBusy("");return}
    setNotice(action==="reject"?"Withdrawal rejected and gross funds returned.":action==="paid"?"Withdrawal marked paid.":action==="processing"?"Withdrawal moved to processing.":"Withdrawal is now under review.");
    await loadQueue(); setBusy("");
  };
  useEffect(()=>{if(tab==="withdrawals")loadQueue()},[tab]);

  const sections: Array<{key:string;label:string;icon:LucideIcon}>=[{key:"overview",label:"Overview",icon:Gauge},{key:"withdrawals",label:"Withdrawals",icon:ArrowDownToLine},{key:"users",label:"Users",icon:Users},{key:"agents",label:"ZPA",icon:ShieldCheck},{key:"settings",label:"Settings",icon:Settings2}];
  const navItems = [
    {key:"overview",label:"Overview",icon:Gauge},
    {key:"withdrawals",label:"Withdrawals",icon:ArrowDownToLine,badge:data.pending_withdrawals},
    {key:"users",label:"Users",icon:Users},
    {key:"agents",label:"ZPA",icon:ShieldCheck},
    {key:"settings",label:"Settings",icon:Settings2}
  ];
  return <div className="admin-frame">
    <aside className="admin-sidebar">
      <Link href="/dashboard" className="admin-brand"><span className="brand-mark">Z</span><span>ZYNTH</span><small>ADMIN</small></Link>
      <div className="admin-nav-label">CONTROL CENTER</div>
      <nav className="admin-list-nav" aria-label="Admin navigation">
        {navItems.map(({key,label,icon:Icon,badge})=>
          <button key={key} onClick={()=>setTab(key)} className={tab===key?"admin-list-item active":"admin-list-item"}>
            <span className="admin-list-icon"><Icon size={16}/></span><span className="admin-list-label">{label}</span>{badge && badge>0?<em>{badge}</em>:null}
          </button>
        )}
        <div className="admin-list-separator"/>
        <Link href="/admin/deposits" className="admin-list-item"><span className="admin-list-icon"><ArrowDownToLine size={16}/></span><span className="admin-list-label">Deposits</span>{(data.pending_deposits||0)>0?<em>{data.pending_deposits}</em>:null}</Link>
        <Link href="/admin/payments" className="admin-list-item"><span className="admin-list-icon"><Settings2 size={16}/></span><span className="admin-list-label">Payments</span></Link>
      </nav>
      <div className="admin-sidebar-bottom">
        <span className="admin-session"><i/>Online</span>
        <div className="admin-identity"><span className="avatar">A</span><span><b>Administrator</b><small>{adminEmail}</small></span></div>
        <button className="ghost admin-refresh" onClick={refresh} disabled={busy==="refresh"} title="Refresh"><RefreshCw size={15}/></button>
      </div>
    </aside>

    <main className="admin-main">
      <header className="admin-topbar">
        <div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ADMIN</span><span className="live-dot"><i/>CONTROL ONLINE</span></div><h1>{tab==="overview"?"System overview":sections.find(x=>x.key===tab)?.label}</h1><p>Operational controls, liquidity visibility and account administration.</p></div>
        <div className="admin-top-actions"><span className="admin-session"><i/> Admin session</span><button className="ghost admin-refresh" onClick={refresh} disabled={busy==="refresh"}><RefreshCw size={15}/> {busy==="refresh"?"Refreshing":"Refresh"}</button></div>
      </header>
      {notice&&<div className="admin-notice">{notice}</div>}

      {tab==="overview"&&<section className="admin-section">
        {((data.pending_withdrawals||0)>0||(data.pending_deposits||0)>0)&&<div className="admin-priority"><div><span className="admin-priority-dot"/><div><b>Attention required</b><small>{data.pending_withdrawals||0} withdrawal{data.pending_withdrawals===1?"":"s"} and {data.pending_deposits||0} deposit{data.pending_deposits===1?"":"s"} waiting for review · {naira(data.pending_withdrawal_amount||0)} withdrawals · {naira(data.pending_deposit_amount||0)} deposits</small></div></div><div style={{display:"flex",gap:12}}>{(data.pending_withdrawals||0)>0&&<button className="text-action" onClick={()=>setTab("withdrawals")}>Withdrawals <ChevronRight size={13}/></button>}{(data.pending_deposits||0)>0&&<Link className="text-action" href="/admin/deposits">Deposits <ChevronRight size={13}/></Link>}</div></div>}
        <div className="admin-kpis">
          {[
            [CircleDollarSign,"Wallet liquidity",naira(data.wallet_liquidity),"LIQUIDITY"],
            [WalletCards,"Vault principal",naira(data.vaulted_principal),"LOCKED"],
            [Users,"Total users",data.users,"CUSTOMERS"],
            [ArrowDownToLine,"Pending withdrawals",data.pending_withdrawals,"ACTION"],
            [WalletCards,"Pending deposits",data.pending_deposits||0,"ACTION"]
          ].map(([Icon,label,value,tag]:any)=><div className="admin-kpi" key={label}>
            <div className="admin-kpi-top"><span className="admin-kpi-icon"><Icon size={16}/></span><em>{tag}</em></div>
            <small>{label}</small><b>{value}</b>
          </div>)}
        </div>
        <div className="admin-grid">
          <section className="admin-card admin-feature-card"><div className="admin-card-head"><div><span className="muted">SYSTEM PULSE</span><h2>Platform health</h2><p>Live operating indicators across the ZYNTH financial engine.</p></div><span className="status-badge"><i/>LIVE</span></div>
            <div className="health-grid">{[
              ["Users funded",data.funded_users],["Active vaults",data.vaults_active],["Pending withdrawal value",naira(data.pending_withdrawal_amount)],["ZPA active",data.active_zpa_agents+"/"+data.zpa_agents]
            ].map(([a,b])=><div key={a as string}><span>{a}</span><b>{b}</b></div>)}</div>
          </section>
          <section className="admin-card admin-feature-card"><div className="admin-card-head"><div><span className="muted">CONTROL SETTINGS</span><h2>Current rules</h2><p>The active parameters currently governing the platform.</p></div><button className="text-action" onClick={()=>setTab("settings")}>Manage <ChevronRight size={13}/></button></div>
            <div className="rule-list"><div><span>Minimum deposit</span><b>{naira(data.settings?.global_min_deposit||0)}</b></div><div><span>Configured yield</span><b>{data.settings?.current_yield_pct||0}%</b></div><div><span>Exit fee</span><b>{data.settings?.exit_fee_pct||0}%</b></div><div><span>Instant ZPA commission</span><b>{data.settings?.instant_commission_pct||0}%</b></div><div><span>Deposits</span><b className={data.settings?.deposits_enabled?"ok":"pending"}>{data.settings?.deposits_enabled?"Enabled":"Paused"}</b></div></div>
          </section>
        </div>
        <section className="admin-card admin-wide-card"><div className="admin-card-head"><div><span className="muted">OPERATIONS QUEUE</span><h2>Recent withdrawal activity</h2><p>Review the latest requests and act on anything still pending.</p></div><button className="text-action" onClick={()=>setTab("withdrawals")}>Open queue <ChevronRight size={13}/></button></div><AdminWithdrawals rows={(queue.length?queue:data.recent_withdrawals).slice(0,5)} busy={busy} onProcess={processWithdrawal}/></section>
      </section>}

      {tab==="withdrawals"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">MONEY MOVEMENT</span><h2>Withdrawal queue</h2><p>Pending requests require manual operational approval.</p></div><span className="admin-count">{data.pending_withdrawals} pending</span></div><AdminWithdrawals rows={queue.length?queue:data.recent_withdrawals} busy={busy} onProcess={processWithdrawal}/></section></section>}

      {tab==="users"&&<section className="admin-section"><section className="admin-card admin-users-card"><div className="admin-card-head"><div><span className="muted">CUSTOMERS / COMMAND CENTER</span><h2>User directory</h2><p>Search, inspect and administer every account without bypassing the financial ledger.</p></div><span className="admin-count">{data.users} users</span></div><AdminUsers initialUsers={data.recent_users as any}/></section></section>}

      {tab==="agents"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">ZPA NETWORK</span><h2>Agent performance</h2><p>Activation activity and current status.</p></div><span className="admin-count">{data.zpa_agents} agents</span></div><div className="admin-table">{data.zpa.map(a=><div className="admin-row" key={a.zpa_id}><div className="admin-person"><span className="avatar">Z</span><span><b>{a.zpa_id}</b><small>{a.full_name||a.email}</small></span></div><span>{a.status}</span><span>{a.current_month_activations} this month</span><strong>{a.total_historical_activations} total</strong></div>)}{!data.zpa.length&&<div className="admin-empty"><Users size={22}/><p>No ZPA profiles yet.</p></div>}</div></section></section>}

      {tab==="settings"&&<section className="admin-section"><section className="admin-card settings-card"><div className="admin-card-head"><div><span className="muted">SYSTEM VARIABLES</span><h2>Platform settings</h2><p>These values drive vault and referral calculations. Keep live-money controls disabled until the operating and compliance structure is ready.</p></div></div>
        <div className="settings-grid">
          {[["minDeposit","Minimum deposit","NGN",settings.minDeposit],["minWithdrawal","Minimum withdrawal","NGN",settings.minWithdrawal],["yieldPct","Configured yield","%",settings.yieldPct],["exitFeePct","Exit fee","%",settings.exitFeePct],["commissionPct","Instant commission","%",settings.commissionPct]].map(([key,label,suffix,val]:any)=><label key={key}><span>{label}</span><div className="setting-input"><input type="number" min="0" value={val} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})}/><b>{suffix}</b></div></label>)}
        </div>
        <label className="toggle-row"><span><b>Deposits enabled</b><small>Allow the funding engine to accept activation deposits.</small></span><input type="checkbox" checked={settings.depositsEnabled} onChange={e=>setSettings({...settings,depositsEnabled:e.target.checked})}/></label><label className="toggle-row"><span><b>Withdrawals enabled</b><small>Pause new withdrawal requests without affecting existing requests.</small></span><input type="checkbox" checked={settings.withdrawalsEnabled} onChange={e=>setSettings({...settings,withdrawalsEnabled:e.target.checked})}/></label><label className="setting-textarea"><span>Withdrawal processing notice</span><textarea value={settings.withdrawalNotice} onChange={e=>setSettings({...settings,withdrawalNotice:e.target.value})}/></label>
        <button className="primary save-settings" onClick={saveSettings} disabled={busy==="settings"}>{busy==="settings"?"Saving…":"Save system settings"}</button>
      </section></section>}
    </main>
  </div>;
}

function AdminWithdrawals({rows,busy,onProcess}:{rows:any[];busy:string;onProcess:(id:string,a:string)=>void}) {
  return <div className="admin-table withdrawal-table">{rows.map(r=>{const gross=Number(r.gross_amount??r.amount??0),net=Number(r.net_amount??r.amount??0),age=Number(r.age_hours||0);return <div className="admin-row" key={r.id}><div className="admin-person"><span className="avatar"><ArrowDownToLine size={14}/></span><span><b>{naira(net)}</b><small>{r.full_name||r.email||r.user_id} · {r.bank_name||"Bank not set"} · ••••{String(r.account_number||"").slice(-4)} · {r.reference||"No reference"} · {date(r.created_at)}</small></span></div><span className={"status-text "+r.status}>{String(r.status).replace("_"," ")}</span><span className="withdraw-queue-meta">{naira(gross)}<small>{age<1?"new":age.toFixed(1)+"h"}</small></span><div className="row-actions">{r.status==="pending"&&<button className="approve" disabled={busy===r.id} onClick={()=>onProcess(r.id,"review")}><CheckCircle2 size={14}/><span>Review</span></button>}{r.status==="under_review"&&<button className="approve" disabled={busy===r.id} onClick={()=>onProcess(r.id,"processing")}><CheckCircle2 size={14}/><span>Process</span></button>}{r.status==="processing"&&<button className="approve" disabled={busy===r.id} onClick={()=>onProcess(r.id,"paid")}><CheckCircle2 size={14}/><span>Mark paid</span></button>}{["pending","under_review"].includes(r.status)&&<button className="reject" disabled={busy===r.id} onClick={()=>onProcess(r.id,"reject")}><XCircle size={14}/><span>Reject</span></button>}</div></div>})}{!rows.length&&<div className="admin-empty"><Clock3 size={22}/><p>No active withdrawal requests.</p></div>}</div>;
}
