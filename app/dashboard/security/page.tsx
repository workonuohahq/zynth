"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,Clock3,KeyRound,LogOut,Monitor,RefreshCw,ShieldCheck,Smartphone,TabletSmartphone,UserRound,AlertTriangle,ShieldAlert} from "lucide-react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";

const fmt=(v:any)=>v?new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"—";
const icon=(t:string)=>t==="mobile"?Smartphone:t==="tablet"?TabletSmartphone:Monitor;

export default function SecurityPage(){
 const[data,setData]=useState<any>({devices:[],sessions:[],events:[],alerts:[],withdrawal_pin:{configured:false}});
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState("");
 const[pin,setPin]=useState(""),[newPin,setNewPin]=useState(""),[pinMode,setPinMode]=useState<"set"|"change"|"reset">("set"),[pinBusy,setPinBusy]=useState(false),[pinMsg,setPinMsg]=useState("");
 const supabase=createSupabaseBrowserClient();

 async function load(){
  setLoading(true);
  // The installed PWA credential is the single device/session identity.
  // Reuse it when valid; register security telemetry only when needed.
  try {
   const heartbeat=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"heartbeat"})});
   const hb=await heartbeat.json().catch(()=>null);
   if(!heartbeat.ok || hb?.active!==true){
    await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"register"})});
   }
  } catch {}
  localStorage.removeItem("zynth-security-device-key");
  localStorage.removeItem("zynth-security-session-key");
  localStorage.removeItem("zynth-security-session-id");
  const {data:result,error}=await supabase.rpc("zynth_security_center");
  if(!error&&result){setData(result);setPinMode(result.withdrawal_pin?.configured?"change":"set");}
  setLoading(false);
 }
 useEffect(()=>{void load()},[]);

 async function revoke(id:string){
  setBusy(id);setMessage("");
  const r=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"revoke",sessionId:id})});
  const j=await r.json().catch(()=>null);
  setMessage(!r.ok||!j?.ok?"We couldn't sign out that session. Please try again.":"Session signed out.");
  if(r.ok)await load();
  setBusy(null);
 }
 async function revokeDevice(id:string){
  if(!window.confirm("Revoke this device and all of its active sessions?"))return;
  setBusy("device:"+id);setMessage("");
  const r=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"revoke_device",deviceId:id})});
  const j=await r.json().catch(()=>null);
  setMessage(!r.ok||!j?.ok?"We couldn't revoke that device. Please try again.":"Device revoked. "+Number(j.count||0)+" session(s) signed out.");
  if(r.ok)await load();
  setBusy(null);
 }
 async function revokeOthers(){
  const current=data.sessions.find((s:any)=>s.current===true)?.id||"";
  if(!current){setMessage("This session is still being registered. Try again in a moment.");return;}
  setBusy("all");
  const r=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"revoke_all",currentSessionId:current})});
  const j=await r.json().catch(()=>null);
  setMessage(r.ok?Number(j?.count||0)+" other session"+(Number(j?.count||0)===1?"":"s")+" signed out.":"We couldn't sign out the other sessions.");
  if(r.ok)await load();
  setBusy(null);
 }
 async function savePin(){
  setPinBusy(true);setPinMsg("");
  const action=pinMode==="set"?"set":"change";
  const r=await fetch("/api/security/withdrawal-pin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,pin:newPin,currentPin:pin})});
  const j=await r.json().catch(()=>null);
  if(!r.ok){setPinMsg(j?.error||"Unable to update withdrawal PIN.");setPinBusy(false);return;}
  setPinMsg(pinMode==="set"?"Withdrawal PIN configured.":"Withdrawal PIN updated.");
  setPin("");setNewPin("");setPinMode("change");await load();setPinBusy(false);
 }
 const pinConfigured=Boolean(data.withdrawal_pin?.configured);
 const status=data.security_status==="GOOD"?"GOOD":"REVIEW";

 return <section className="dashboard-content security-page">
  <header className="dashboard-header premium-header">
   <div>
    <Link href="/dashboard" className="text-action"><ArrowLeft size={14}/> Back to dashboard</Link>
    <div className="eyebrow-row"><span className="eyebrow">ZYNTH / SECURITY CENTER</span><span className="live-dot"><i/> PROTECTED</span></div>
    <h1>Secure your account.</h1>
    <p>Review your account security, withdrawal protection, devices, sessions and sign-in activity.</p>
   </div>
   <button className="fund-btn secondary-dark" onClick={load} disabled={loading}><RefreshCw size={16} className={loading?"spin":""}/> Refresh</button>
  </header>

  <div className="security-grid">
   <section className="panel security-hero security-status-card">
    <div className="security-hero-icon"><ShieldCheck size={24}/></div>
    <div className="security-status-copy">
     <span className="muted">SECURITY STATUS</span>
     <h2>{status}</h2>
     <p>{status==="GOOD"?"No high-risk security alerts are currently active.":"Review recent security activity and any locked protection controls."}</p>
    </div>
    <strong className={status==="GOOD"?"security-status-good":"security-status-review"}>{Number(data.security_alert_count||0)} alert{Number(data.security_alert_count||0)===1?"":"s"}</strong>
   </section>

   <section className="panel security-actions">
    <div className="panel-head"><div><span className="muted">WITHDRAWAL PROTECTION</span><h2>Withdrawal PIN</h2></div><KeyRound size={19}/></div>
    <div className="security-pin-status">
     <span><b>{pinConfigured?"Set":"Not set"}</b><small>{pinConfigured&&data.withdrawal_pin?.last_changed_at?"Last changed "+fmt(data.withdrawal_pin.last_changed_at):"A 6-digit PIN is required before withdrawals can be submitted."}</small></span>
     {data.withdrawal_pin?.locked_until&&new Date(data.withdrawal_pin.locked_until)>new Date()&&<strong className="security-risk">Locked until {fmt(data.withdrawal_pin.locked_until)}</strong>}
    </div>
    <div className="security-tabs">
     <button className={pinMode==="set"&&!pinConfigured?"active":""} onClick={()=>setPinMode("set")} disabled={pinConfigured}>Set</button>
     <button className={pinMode==="change"&&pinConfigured?"active":""} onClick={()=>setPinMode("change")} disabled={!pinConfigured}>Change</button>
     <button className={pinMode==="reset"?"active":""} onClick={()=>setPinMode("reset")} disabled={!pinConfigured}>Reset</button>
    </div>
    {(pinMode==="set"&&!pinConfigured)||pinConfigured?<div className="security-pin-form">
      {(pinMode!=="set"||pinConfigured)&&<label>Current PIN<input inputMode="numeric" maxLength={6} type="password" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/></label>}
      <label>New PIN<input inputMode="numeric" maxLength={6} type="password" value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,""))}/></label>
      <button className="fund-btn" onClick={savePin} disabled={pinBusy}>{pinBusy?"Updating…":pinMode==="set"?"Set PIN":pinMode==="reset"?"Reset PIN":"Change PIN"}</button>
      {pinMode==="reset"&&<small className="muted">Reset remains protected by your current PIN; a forgotten PIN requires support-assisted account recovery.</small>}
      {pinMsg&&<div className="notice">{pinMsg}</div>}
    </div>:null}
   </section>

   <section className="panel security-actions">
    <div className="panel-head"><div><span className="muted">SESSION CONTROL</span><h2>Active sessions</h2></div><button className="danger-outline" onClick={revokeOthers} disabled={busy!==null}><LogOut size={15}/> Sign out all others</button></div>
    {message&&<div className="notice">{message}</div>}
    {loading?<div className="security-loading"><RefreshCw className="spin" size={18}/> Loading security activity…</div>:data.sessions.length?<div className="security-list">
     {data.sessions.map((s:any)=>{const Device=icon(s.device_type);const current=s.current===true;return <article className={"security-row "+(current?"current":"")} key={s.id}>
      <span className="security-device-icon"><Device size={19}/></span>
      <span className="security-row-copy"><b>{current?"Current device":s.device_type==="mobile"?"Mobile device":"Desktop browser"}</b><small>{s.browser_name||"Browser"} · {s.os_name||"Unknown OS"}</small><small>Last active {fmt(s.last_seen_at)}</small></span>
      {current?<span className="security-current"><i/> Active now</span>:<button className="danger-link" onClick={()=>revoke(s.id)} disabled={busy!==null}>{busy===s.id?"Signing out…":"Sign out"}</button>}
     </article>})}
    </div>:<div className="security-empty">No active sessions recorded yet.</div>}
   </section>

   <section className="panel security-devices">
    <div className="panel-head"><div><span className="muted">KNOWN DEVICES</span><h2>Devices</h2></div><Smartphone size={19}/></div>
    {data.devices.length?<div className="security-list">{data.devices.map((d:any)=>{const Device=icon(d.device_type);const revoked=Boolean(d.revoked_at);return <article className="security-row" key={d.id}>
      <span className="security-device-icon"><Device size={19}/></span>
      <span className="security-row-copy"><b>{d.device_name||"ZYNTH device"}</b><small>{d.browser_name||"Browser"} · {d.os_name||"Unknown OS"}</small><small>First seen {fmt(d.first_seen_at)} · Last active {fmt(d.last_seen_at)}</small></span>
      {revoked?<span className="security-risk">Revoked</span>:<button className="danger-link" onClick={()=>revokeDevice(d.id)} disabled={busy!==null}>{busy==="device:"+d.id?"Revoking…":"Revoke"}</button>}
    </article>})}</div>:<div className="security-empty">No device history yet.</div>}
   </section>

   <section className="panel security-events">
    <div className="panel-head"><div><span className="muted">LOGIN HISTORY</span><h2>Sign-in activity</h2></div><Clock3 size={19}/></div>
    {data.events.length?<div className="security-list">{data.events.map((e:any)=><article className="security-row" key={e.id}>
      <span className="security-device-icon"><UserRound size={18}/></span>
      <span className="security-row-copy"><b>{String(e.event_type).replaceAll("_"," ")}</b><small>{fmt(e.created_at)} · {e.success?"Successful":"Unsuccessful"}</small><small>{e.failure_reason||"Authentication event"}</small></span>
      <span className={e.success?"security-current":"security-risk"}>{e.success?"OK":"Review"}</span>
    </article>)}</div>:<div className="security-empty">No recent sign-in events.</div>}
   </section>

   <section className="panel security-events">
    <div className="panel-head"><div><span className="muted">SECURITY ALERTS</span><h2>Alerts</h2></div><ShieldAlert size={19}/></div>
    {data.alerts?.length?<div className="security-list">{data.alerts.map((a:any)=><article className="security-row" key={a.source+":"+a.id}>
      <span className="security-device-icon"><AlertTriangle size={18}/></span>
      <span className="security-row-copy"><b>{String(a.event_type).replaceAll("_"," ")}</b><small>{a.source} · {fmt(a.created_at)}</small><small>{a.failure_reason||"Review this security event."}</small></span>
      <span className="security-risk">{Number(a.risk_score||0)}/100</span>
    </article>)}</div>:<div className="security-empty">No active security alerts.</div>}
   </section>

   <section className="panel security-2fa">
    <div className="panel-head"><div><span className="muted">EVENTUALLY</span><h2>2FA / MFA</h2></div><ShieldCheck size={19}/></div>
    <p>Two-factor authentication will use ZYNTH's authentication assurance layer. It is not enabled here yet, so this section does not pretend it is protecting your account.</p>
    <span className="security-coming">COMING SOON</span>
   </section>
  </div>
 </section>;
}
