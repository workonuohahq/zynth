"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Bell, Check, ChevronDown, ChevronRight, Gift, LockKeyhole, ShieldCheck, Smartphone, TrendingUp, WalletCards, RefreshCw } from "lucide-react";

const money=(n:any)=>"₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function DashboardPage(){
  const [data,setData]=useState<any>({profile:null,investments:[],transactions:[],lots:[],summary:{}});
  const [loading,setLoading]=useState(true);
  const [pushStatus,setPushStatus]=useState<"loading"|"unsupported"|"denied"|"enabled"|"available"|"error">("loading");
  const [pushBusy,setPushBusy]=useState(false);
  const [pushMessage,setPushMessage]=useState("");
  const [pushOpen,setPushOpen]=useState(false);

  async function inspectPush(){
    if(typeof window==="undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)){
      setPushStatus("unsupported"); return;
    }
    if(Notification.permission==="denied"){ setPushStatus("denied"); return; }
    try{
      const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
      const subscription=await registration.pushManager.getSubscription();

      // The database is the authority for whether THIS browser/device is enabled.
      // Never infer an enabled state from localStorage or a browser subscription alone.
      if(!subscription){
        window.localStorage.removeItem("zynth-vapid-fingerprint");
        setPushStatus("available");
        return;
      }

      const endpoint=subscription.endpoint;
      const healthResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(endpoint),{cache:"no-store"});
      const health=await healthResponse.json().catch(()=>null);
      const serverActive=healthResponse.ok && health?.active===true;

      if(!serverActive){
        // Browser has a subscription that the server does not recognize as active.
        // Treat it as stale and force the user through the enable flow again.
        await subscription.unsubscribe().catch(()=>false);
        window.localStorage.removeItem("zynth-vapid-fingerprint");
        setPushStatus("available");
        return;
      }

      setPushStatus("enabled");
    }catch{
      // Fail closed: an uncertain server state must never render as Active.
      setPushStatus("available");
    }
  }

  useEffect(()=>{ fetch("/api/account/dashboard",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Unable to load dashboard.");return r.json();}).then(setData).catch(()=>{}).finally(()=>setLoading(false)); },[]);
  useEffect(()=>{ void inspectPush(); },[]);
  const p=data.summary||{};
  const nextLockedLot=useMemo(()=>((data.lots||[]).find((l:any)=>new Date(l.unlock_at)>new Date())),[data.lots]);
  const availableLots=(data.lots||[]).filter((l:any)=>new Date(l.unlock_at)<=new Date()).length;
  const name=data.profile?.full_name?.split(" ")[0]||"there";
  if(loading)return <section className="dashboard-content"><div className="trader-loading"><RefreshCw className="spin" size={18}/><span>Loading your secure portfolio…</span></div></section>;
  const notice=nextLockedLot?"Your next locked profit lot unlocks on "+new Date(nextLockedLot.unlock_at).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"})+". "+availableLots+" profit lot"+(availableLots===1?" is":"s are")+" already available.":"Your confirmed profit is currently fully available. New profitable settlements will appear here with their exact unlock dates.";

  async function enablePush(){
    setPushBusy(true); setPushMessage("");
    try{
      if(!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
      const permission=await Notification.requestPermission();
      if(permission!=="granted"){
        setPushStatus(permission==="denied"?"denied":"available");
        throw new Error(permission==="denied"?"Notifications are blocked. Allow them in your device settings.":"Notification permission was not granted.");
      }
      const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
      await navigator.serviceWorker.ready;
      const configResponse=await fetch("/api/push/config",{cache:"no-store"});
      if(!configResponse.ok) throw new Error("Push service is temporarily unavailable.");
      const config=await configResponse.json();
      if(!config.publicKey) throw new Error("Push service is not configured yet.");
      let subscription=await registration.pushManager.getSubscription();
      const keyFingerprint=`zynth-vapid:${String(config.publicKey).slice(0,16)}`;
      const previousFingerprint=window.localStorage.getItem("zynth-vapid-fingerprint");
      if(subscription && previousFingerprint !== keyFingerprint){
        await subscription.unsubscribe().catch(()=>false);
        subscription=null;
      }
      if(!subscription) subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey});
      window.localStorage.setItem("zynth-vapid-fingerprint",keyFingerprint);
      const payload=subscription.toJSON();
      if(!payload.endpoint) throw new Error("Push subscription endpoint is unavailable. Please try again.");
      const response=await fetch("/api/push/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:payload.endpoint,keys:payload.keys,userAgent:navigator.userAgent})});
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||"Unable to activate notifications.");}

      // Confirm the server actually persisted THIS device before showing Active.
      const verifyResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(payload.endpoint),{cache:"no-store"});
      const verify=await verifyResponse.json().catch(()=>null);
      if(!verifyResponse.ok || verify?.active!==true) throw new Error("Notification subscription could not be verified. Please try again.");

      setPushStatus("enabled"); setPushMessage("This device is now registered for ZYNTH alerts.");
    }catch(error){
      setPushMessage(error instanceof Error?error.message:"Unable to enable notifications.");
      void inspectPush();
    }finally{setPushBusy(false);}
  }
  return <section className="dashboard-content">
    <header className="dashboard-header premium-header"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / PORTFOLIO</span><span className="live-dot"><i/> LIVE ACCOUNT</span></div><h1>Welcome back, {name}.</h1><p>Your portfolio follows confirmed strategy performance — not fixed promises.</p></div><div className="header-actions"><Link className="fund-btn" href="/dashboard/investments"><TrendingUp size={17}/> Explore strategies</Link><Link className="fund-btn secondary-dark" href="/dashboard/withdraw">Withdraw</Link></div></header>
    {pushStatus!=="unsupported" && pushStatus!=="loading" && <section className={"panel push-notification-panel dashboard-push-prompt "+(pushOpen?"is-open":"is-collapsed")} aria-label="Device notifications">
      <button className="push-notification-summary" type="button" onClick={()=>setPushOpen(v=>!v)} aria-expanded={pushOpen} aria-controls="device-notification-details">
        <span className="push-notification-copy">
          <span className="push-notification-icon">{pushStatus==="enabled"?<Check size={18}/>:<Bell size={18}/>}</span>
          <span>
            <span className="eyebrow">DEVICE NOTIFICATIONS</span>
            <strong>{pushStatus==="enabled"?"Notifications are active on this device.":"Never miss important ZYNTH activity."}</strong>
            <small>{pushStatus==="enabled"?"Alerts are enabled for this device.":"Manage this device’s ZYNTH alert permission."}</small>
          </span>
        </span>
        <span className="push-notification-summary-meta">
          {pushStatus==="enabled"?<span className="push-status enabled"><i/> Active</span>:pushStatus==="denied"?<span className="push-status warning">Blocked</span>:<span className="push-status">Available</span>}
          <ChevronDown size={16}/>
        </span>
      </button>
      {pushOpen&&<div id="device-notification-details" className="push-notification-details">
        <div className="push-notification-details-inner">
          <p>{pushStatus==="enabled"?"You’ll receive important account, money movement, investment and security alerts here.":"Enable device alerts for deposits, withdrawals, investments and other important account activity — even when ZYNTH is not open."}</p>
          <div className="push-notification-action">
            {pushStatus==="enabled"?<span className="push-status enabled"><i/> Active on this device</span>:pushStatus==="denied"?<span className="push-status warning">Blocked in device settings</span>:<button className="fund-btn primary" disabled={pushBusy} onClick={enablePush} type="button"><Smartphone size={16}/>{pushBusy?"Enabling…":"Enable notifications"}</button>}
          </div>
          {pushStatus==="enabled"&&<small className="push-notification-message"><ShieldCheck size={12}/> Protected device subscription</small>}
          {pushMessage&&pushStatus!=="enabled"&&<small className="push-notification-message">{pushMessage}</small>}
        </div>
      </div>}
    </section>}
    <section className="wealth-hero"><div className="wealth-main"><div className="wealth-label"><span>Total portfolio value</span><span className="secure-chip"><ShieldCheck size={13}/> NAV based</span></div><strong>{money(Number(p.cash||0)+Number(p.invested||0))}</strong><div className="wealth-breakdown"><span><i className="dot available"/> Cash {money(p.cash)}</span><span><i className="dot locked"/> Invested {money(p.invested)}</span></div></div><div className="wealth-side"><div><span>Total P&L</span><b>{money(p.profit)}</b></div><div><span>Realised P&L</span><b>{money(p.realized_profit)}</b></div><div><span>Unrealised P&L</span><b className={Number(p.unrealized_profit||0)>=0?"amount-positive":"amount-negative"}>{money(p.unrealized_profit)}</b></div><div><span>Withdrawable profit</span><b>{money(p.withdrawable_profit)}</b></div><div><span>Locked profit</span><b>{money(p.locked_profit)}</b></div><Link href="/dashboard/vaults">Open Vault <ArrowUpRight size={14}/></Link></div></section>
    <section className="quick-actions dashboard-priority-actions dashboard-referral-only"><Link href="/dashboard/referrals" className="quick-action"><span className="qa-icon gold"><Gift size={17}/></span><span><b>Refer & Earn</b><small>Invite trusted people to ZYNTH</small></span><ChevronRight size={16}/></Link></section>
    <div className="dashboard-grid"><section className="panel portfolio-panel"><div className="panel-head"><div><span className="muted">ACTIVE INVESTMENTS</span><h2>Your strategies</h2></div><Link className="text-action" href="/dashboard/investments">View strategies <ArrowUpRight size={14}/></Link></div>{data.investments?.length?<div className="vault-cards">{data.investments.map((i:any)=><div className="vault-card" key={i.id}><div className="vault-card-top"><span className="status-badge"><i/> ACTIVE</span><span>{i.zynth_strategies?.name||"Strategy"}</span></div><div className="vault-card-amount">{money(i.current_value)}</div><div className="vault-card-meta"><span>Units <b>{Number(i.units).toFixed(4)}</b></span><span>NAV <b>₦{Number(i.zynth_strategies?.nav||0).toFixed(2)}</b></span></div></div>)}</div>:<div className="premium-empty"><div className="empty-icon"><TrendingUp size={21}/></div><h3>Your portfolio starts here</h3><p>Fund your available cash and choose a strategy. Your position value will move with confirmed daily settlement.</p><Link className="primary" href="/dashboard/investments">Explore strategies <ArrowUpRight size={15}/></Link></div>}</section>
    <aside className="dashboard-stack"><section className="panel account-panel"><div className="panel-head"><div><span className="muted">VAULT STATUS</span><h2>Profit unlocks</h2></div><LockKeyhole size={19}/></div><div className="health-row"><span>Available now</span><b className="ok">{money(p.withdrawable_profit)}</b></div><div className="health-row"><span>Still locked</span><b className="pending">{money(p.locked_profit)}</b></div><div className="health-row"><span>Next unlock</span><b className={nextLockedLot?"pending":"ok"}>{nextLockedLot?new Date(nextLockedLot.unlock_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"}):"No locked profit"}</b></div><div className="notice">{notice} <Link href="/dashboard/vaults">View vault <ArrowUpRight size={13}/></Link></div></section></aside></div>
    <section className="panel activity-panel"><div className="panel-head"><div><span className="muted">RECENT ACTIVITY</span><h2>Latest movements</h2></div><Link className="text-action" href="/dashboard/transactions">Full activity <ArrowUpRight size={14}/></Link></div><div className="activity-list">{(data.transactions||[]).map((t:any)=><div className="activity-row" key={t.id}><span className="activity-icon neutral"><BarChart3 size={16}/></span><span className="activity-info"><b>{String(t.type).replaceAll("_"," ")}</b><small>{new Date(t.created_at).toLocaleDateString("en-NG")} · {t.status}</small></span><strong>{money(t.amount)}</strong></div>)}{!data.transactions?.length&&<div className="activity-empty"><WalletCards size={18}/><span>No activity yet.</span></div>}</div></section>
  </section>;
}