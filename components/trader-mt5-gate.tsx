"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,Eye,EyeOff,LockKeyhole,RefreshCw,ShieldCheck,ServerCog} from "lucide-react";

export default function TraderMt5Gate(){
 const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 const [login,setLogin]=useState(""),[server,setServer]=useState(""),[password,setPassword]=useState(""),[show,setShow]=useState(false);
 async function load(){setLoading(true);const r=await fetch("/api/trader/mt5",{cache:"no-store"});const j=await r.json();if(r.ok){setData(j.credentials);if(j.credentials){setLogin(j.credentials.mt5_login==="PENDING"?"":j.credentials.mt5_login);setServer(j.credentials.mt5_server==="PENDING"?"":j.credentials.mt5_server)}}else setMsg(j.error||"Unable to load MT5 verification.");setLoading(false);}
 useEffect(()=>{load()},[]);
 async function submit(e:any){e.preventDefault();setBusy(true);setMsg("");const r=await fetch("/api/trader/mt5",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mt5Login:login,mt5Server:server,investorPassword:password})});const j=await r.json();setBusy(false);if(!r.ok){setMsg(j.error||"Submission failed.");return}setData(j.credentials);setPassword("");setMsg("MT5 details submitted. Your Trader Desk will unlock after administrator verification.");}
 if(loading)return <div className="trader-access-gate"><RefreshCw className="spin" size={18}/><span>Checking trader access…</span></div>;
 const status=data?.status||"pending";
 if(status==="verified")return null;
 return <section className="trader-access-gate-shell"><div className="trader-access-gate">
  <div className="trader-access-icon"><LockKeyhole size={22}/></div>
  <span className="trader-access-kicker">ZYNTH / CONTROLLED ACCESS</span>
  <h1>Verify your MT5 account to enter Trader Desk.</h1>
  <p>Trader Desk access is now tied to a verified MT5 account. Submit your MT5 login, server and investor password once. An administrator will review the details before the workspace becomes available.</p>
  {status==="rejected"&&<div className="trader-access-warning"><ShieldCheck size={15}/><span>{data?.rejection_reason||"Your previous MT5 submission was not approved. Please review the details and resubmit."}</span></div>}
  <form onSubmit={submit} className="trader-mt5-form">
   <label><span>MT5 login</span><input value={login} onChange={e=>setLogin(e.target.value)} inputMode="numeric" placeholder="e.g. 12345678" autoComplete="off"/></label>
   <label><span>MT5 server</span><input value={server} onChange={e=>setServer(e.target.value)} placeholder="e.g. Exness-MT5Real" autoComplete="off"/></label>
   <label><span>Investor password</span><div className="trader-secret-input"><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={data?.investor_password_set?"Enter again to replace stored password":"Investor password"} autoComplete="new-password"/><button type="button" onClick={()=>setShow(x=>!x)}>{show?<EyeOff size={15}/>:<Eye size={15}/>}</button></div></label>
   <button className="primary trader-mt5-submit" disabled={busy}>{busy?"Submitting…":status==="rejected"?"Resubmit MT5 details":"Submit MT5 details"}<ServerCog size={15}/></button>
  </form>
  {msg&&<div className="trader-access-message"><CheckCircle2 size={15}/><span>{msg}</span></div>}
  <div className="trader-access-trust"><ShieldCheck size={15}/><div><b>Credential handling</b><small>Your investor password is encrypted at rest and is only exposed to authorized operations staff for verification.</small></div></div>
 </div></section>;
}
