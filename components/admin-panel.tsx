"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownToLine, ArrowLeft, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Database, Gauge, LogOut, RefreshCw, Settings2, ShieldCheck, Users, WalletCards, XCircle } from "lucide-react";

type AdminData = {
  settings?: { global_min_deposit:number; current_yield_pct:number; exit_fee_pct:number; instant_commission_pct:number; deposits_enabled:boolean };
  users:number; funded_users:number; vaults_active:number; vaulted_principal:number; wallet_liquidity:number;
  pending_withdrawals:number; pending_withdrawal_amount:number; zpa_agents:number; active_zpa_agents:number;
  recent_withdrawals:Array<any>; recent_users:Array<any>; zpa:Array<any>; audit:Array<any>;
};

const naira=(n:number)=>`₦${Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2})}`;
const date=(v:string)=>new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});

export default function AdminPanel({initialData,adminEmail}:{initialData:AdminData;adminEmail:string}) {
  const [data,setData]=useState(initialData);
  const [tab,setTab]=useState("overview");
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [settings,setSettings]=useState({
    minDeposit:Number(data.settings?.global_min_deposit||5500),
    yieldPct:Number(data.settings?.current_yield_pct||0),
    exitFeePct:Number(data.settings?.exit_fee_pct||10),
    commissionPct:Number(data.settings?.instant_commission_pct||5),
    depositsEnabled:Boolean(data.settings?.deposits_enabled)
  });

  const refresh=async()=>{setBusy("refresh");setNotice("");try{location.reload()}finally{setBusy("")}};
  const saveSettings=async()=>{setBusy("settings");setNotice("");
    const r=await fetch("/api/admin/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...settings})});
    const j=await r.json(); if(!r.ok){setNotice(j.error||"Settings update failed.");setBusy("");return}
    setData({...data,settings:j.settings});setNotice("System settings updated.");setBusy("");
  };
  const processWithdrawal=async(id:string,approved:boolean)=>{
    const reason=approved?null:window.prompt("Reason for rejecting this withdrawal:")||"Withdrawal rejected";
    setBusy(id);setNotice("");
    const r=await fetch("/api/admin/withdrawals/process",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({withdrawalId:id,approved,reason})});
    const j=await r.json(); if(!r.ok){setNotice(j.error||"Unable to process withdrawal.");setBusy("");return}
    setData({...data,pending_withdrawals:Math.max(0,data.pending_withdrawals-1),recent_withdrawals:data.recent_withdrawals.map(x=>x.id===id?{...x,status:approved?"completed":"failed"}:x)});
    setNotice(approved?"Withdrawal approved.":"Withdrawal rejected and funds returned.");setBusy("");
  };

  const sections=[["overview","Overview",Gauge],["withdrawals","Withdrawals",ArrowDownToLine],["users","Users",Users],["agents","ZPA",ShieldCheck],["settings","Settings",Settings2]];
  return <div className="admin-frame">
    <aside className="admin-sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></Link>
      <div className="admin-caption">CONTROL PLANE</div>
      <nav>{sections.map(([key,label,Icon]:any)=><button key={key} onClick={()=>setTab(key)} className={tab===key?"admin-nav active":"admin-nav"}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <div className="admin-sidebar-bottom">
        <div className="secure"><ShieldCheck size={15}/><span>Founder access</span></div>
        <div className="admin-identity"><span className="avatar">A</span><span><b>Administrator</b><small>{adminEmail}</small></span></div>
        <Link href="/dashboard" className="admin-back"><ArrowLeft size={14}/> User dashboard</Link>
      </div>
    </aside>

    <main className="admin-main">
      <header className="admin-topbar">
        <div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ADMIN</span><span className="live-dot"><i/>CONTROL ONLINE</span></div><h1>{tab==="overview"?"System overview":sections.find(x=>x[0]===tab)?.[1]}</h1><p>Operational controls, liquidity visibility and account administration.</p></div>
        <button className="ghost admin-refresh" onClick={refresh} disabled={busy==="refresh"}><RefreshCw size={15}/> {busy==="refresh"?"Refreshing":"Refresh"}</button>
      </header>
      {notice&&<div className="admin-notice">{notice}</div>}

      {tab==="overview"&&<section className="admin-section">
        <div className="admin-kpis">
          {[[CircleDollarSign,"Wallet liquidity",naira(data.wallet_liquidity)], [WalletCards,"Active vault principal",naira(data.vaulted_principal)], [Users,"Total users",data.users], [ArrowDownToLine,"Pending withdrawals",data.pending_withdrawals]].map(([Icon,label,value]:any)=><div className="admin-kpi" key={label}><span className="admin-kpi-icon"><Icon size={17}/></span><small>{label}</small><b>{value}</b></div>)}
        </div>
        <div className="admin-grid">
          <section className="admin-card"><div className="admin-card-head"><div><span className="muted">OPERATIONS</span><h2>Platform health</h2></div><span className="status-badge"><i/>LIVE</span></div>
            <div className="health-grid">{[
              ["Users funded",data.funded_users],["Active vaults",data.vaults_active],["Pending withdrawal value",naira(data.pending_withdrawal_amount)],["ZPA active",data.active_zpa_agents+"/"+data.zpa_agents]
            ].map(([a,b])=><div key={a as string}><span>{a}</span><b>{b}</b></div>)}</div>
          </section>
          <section className="admin-card"><div className="admin-card-head"><div><span className="muted">CONFIGURATION</span><h2>Current rules</h2></div><button className="text-action" onClick={()=>setTab("settings")}>Manage <ChevronRight size={13}/></button></div>
            <div className="rule-list"><div><span>Minimum deposit</span><b>{naira(data.settings?.global_min_deposit||0)}</b></div><div><span>Configured yield</span><b>{data.settings?.current_yield_pct||0}%</b></div><div><span>Exit fee</span><b>{data.settings?.exit_fee_pct||0}%</b></div><div><span>Instant ZPA commission</span><b>{data.settings?.instant_commission_pct||0}%</b></div><div><span>Deposits</span><b className={data.settings?.deposits_enabled?"ok":"pending"}>{data.settings?.deposits_enabled?"Enabled":"Paused"}</b></div></div>
          </section>
        </div>
        <section className="admin-card"><div className="admin-card-head"><div><span className="muted">RECENT ACTIVITY</span><h2>Withdrawals</h2></div><button className="text-action" onClick={()=>setTab("withdrawals")}>Open queue <ChevronRight size={13}/></button></div><AdminWithdrawals rows={data.recent_withdrawals.slice(0,5)} busy={busy} onProcess={processWithdrawal}/></section>
      </section>}

      {tab==="withdrawals"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">MONEY MOVEMENT</span><h2>Withdrawal queue</h2><p>Pending requests require manual operational approval.</p></div><span className="admin-count">{data.pending_withdrawals} pending</span></div><AdminWithdrawals rows={data.recent_withdrawals} busy={busy} onProcess={processWithdrawal}/></section></section>}

      {tab==="users"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">CUSTOMERS</span><h2>User directory</h2><p>Account status and balances visible to the founder control plane.</p></div><span className="admin-count">{data.users} users</span></div><div className="admin-table">{data.recent_users.map(u=><div className="admin-row" key={u.id}><div className="admin-person"><span className="avatar">{(u.full_name||u.email||"U").slice(0,1).toUpperCase()}</span><span><b>{u.full_name||"Unnamed user"}</b><small>{u.email}</small></span></div><span>{u.role}</span><span>{u.kyc_verified?"Verified":"Unverified"}</span><strong>{naira(Number(u.main_wallet_balance)+Number(u.locked_vault_balance))}</strong></div>)}</div></section></section>}

      {tab==="agents"&&<section className="admin-section"><section className="admin-card"><div className="admin-card-head"><div><span className="muted">ZPA NETWORK</span><h2>Agent performance</h2><p>Activation activity and current status.</p></div><span className="admin-count">{data.zpa_agents} agents</span></div><div className="admin-table">{data.zpa.map(a=><div className="admin-row" key={a.zpa_id}><div className="admin-person"><span className="avatar">Z</span><span><b>{a.zpa_id}</b><small>{a.full_name||a.email}</small></span></div><span>{a.status}</span><span>{a.current_month_activations} this month</span><strong>{a.total_historical_activations} total</strong></div>)}{!data.zpa.length&&<div className="admin-empty"><Users size={22}/><p>No ZPA profiles yet.</p></div>}</div></section></section>}

      {tab==="settings"&&<section className="admin-section"><section className="admin-card settings-card"><div className="admin-card-head"><div><span className="muted">SYSTEM VARIABLES</span><h2>Platform settings</h2><p>These values drive vault and referral calculations. Keep live-money controls disabled until the operating and compliance structure is ready.</p></div></div>
        <div className="settings-grid">
          {[["minDeposit","Minimum deposit","NGN",settings.minDeposit],["yieldPct","Configured yield","%",settings.yieldPct],["exitFeePct","Exit fee","%",settings.exitFeePct],["commissionPct","Instant commission","%",settings.commissionPct]].map(([key,label,suffix,val]:any)=><label key={key}><span>{label}</span><div className="setting-input"><input type="number" min="0" value={val} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})}/><b>{suffix}</b></div></label>)}
        </div>
        <label className="toggle-row"><span><b>Deposits enabled</b><small>Allow the funding engine to accept activation deposits.</small></span><input type="checkbox" checked={settings.depositsEnabled} onChange={e=>setSettings({...settings,depositsEnabled:e.target.checked})}/></label>
        <button className="primary save-settings" onClick={saveSettings} disabled={busy==="settings"}>{busy==="settings"?"Saving…":"Save system settings"}</button>
      </section></section>}
    </main>
  </div>;
}

function AdminWithdrawals({rows,busy,onProcess}:{rows:any[];busy:string;onProcess:(id:string,a:boolean)=>void}) {
  return <div className="admin-table withdrawal-table">{rows.map(r=><div className="admin-row" key={r.id}><div className="admin-person"><span className="avatar"><ArrowDownToLine size={14}/></span><span><b>{naira(r.amount)}</b><small>{r.full_name||r.email||r.user_id} · {date(r.created_at)}</small></span></div><span className={"status-text "+r.status}>{r.status}</span><span>{r.reference||"—"}</span><div className="row-actions">{r.status==="pending"?<><button className="approve" disabled={busy===r.id} onClick={()=>onProcess(r.id,true)}><CheckCircle2 size={14}/><span>Approve</span></button><button className="reject" disabled={busy===r.id} onClick={()=>onProcess(r.id,false)}><XCircle size={14}/><span>Reject</span></button></>:<span className="muted">{r.status}</span>}</div></div>)}{!rows.length&&<div className="admin-empty"><Clock3 size={22}/><p>No withdrawal requests.</p></div>}</div>;
}
