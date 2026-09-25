"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Gauge, RefreshCw, Settings2, ShieldCheck, Users, WalletCards, XCircle, type LucideIcon } from "lucide-react";

type AdminData = {
  settings?: { global_min_deposit:number; current_yield_pct:number; exit_fee_pct:number; instant_commission_pct:number; deposits_enabled:boolean };
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
