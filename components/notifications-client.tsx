"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeft, Bell, CheckCheck, CircleDollarSign, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Notice={id:string;title:string;body:string;type:string;read_at:string|null;created_at:string};
type PushStatus="loading"|"unsupported"|"denied"|"enabled"|"available"|"error";
const iconFor=(type:string)=>type==="deposit"?WalletCards:type==="vault"?LockKeyhole:type==="withdrawal"?ArrowDownLeft:type==="security"?ShieldCheck:CircleDollarSign;

export default function NotificationsClient(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [items,setItems]=useState<Notice[]>([]);
 const [loading,setLoading]=useState(true);
 const [pushStatus,setPushStatus]=useState<PushStatus>("loading");
 const [pushBusy,setPushBusy]=useState(false);
 const [pushMessage,setPushMessage]=useState("");
 async function load(){
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return}
   const {data}=await supabase.from("notifications").select("id,title,body,type,read_at,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
   setItems((data||[]) as Notice[]); setLoading(false);
 }
 async function inspectPush(){
   if(typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)){setPushStatus("unsupported");return}
   if(Notification.permission === "denied"){setPushStatus("denied");return}
   try{
     const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
     const subscription=await registration.pushManager.getSubscription();
     if(!subscription){
       window.localStorage.removeItem("zynth-vapid-fingerprint");
       setPushStatus("available");
       return;
     }
     const healthResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(subscription.endpoint),{cache:"no-store"});
     const health=await healthResponse.json().catch(()=>null);
     if(!healthResponse.ok || health?.active!==true){
       await subscription.unsubscribe().catch(()=>false);
       window.localStorage.removeItem("zynth-vapid-fingerprint");
       setPushStatus("available");
       return;
     }
     const configResponse=await fetch("/api/push/config",{cache:"no-store"});
     const config=await configResponse.json().catch(()=>({}));
     if(!configResponse.ok||!config.publicKey){setPushStatus("error");return}
     const fingerprint=`zynth-vapid:${String(config.publicKey).slice(0,16)}`;
     const previousFingerprint=window.localStorage.getItem("zynth-vapid-fingerprint");
     if(previousFingerprint&&previousFingerprint!==fingerprint){
       await subscription.unsubscribe().catch(()=>false);
       window.localStorage.removeItem("zynth-vapid-fingerprint");
       setPushStatus("available");
       return;
     }
     setPushStatus("enabled");
   }catch{setPushStatus("error")}
 }
 useEffect(()=>{load();inspectPush()},[]);
 async function enablePush(){
   setPushBusy(true);setPushMessage("");
   try{
     if(!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
     const permission=await Notification.requestPermission();
     if(permission!=="granted"){setPushStatus(permission==="denied"?"denied":"available");throw new Error("Notification permission was not granted.")}
     const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
     await navigator.serviceWorker.ready;
     const config=await fetch("/api/push/config",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("Push service unavailable.")));
     if(!config.publicKey) throw new Error("Push service is not configured yet.");
     const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey});
     const payload=subscription.toJSON();
   if(!payload.endpoint) throw new Error("Push subscription endpoint is unavailable. Please try again.");
     const response=await fetch("/api/push/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:payload.endpoint,keys:payload.keys,userAgent:navigator.userAgent})});
     if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Unable to activate notifications.")}
     const verifyResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(payload.endpoint),{cache:"no-store"});
     const verify=await verifyResponse.json().catch(()=>null);
     if(!verifyResponse.ok || verify?.active!==true)throw new Error("Notification subscription could not be verified. Please try again.");
     setPushStatus("enabled");setPushMessage("Notifications are enabled on this device.");
   }catch(error){setPushMessage(error instanceof Error?error.message:"Unable to enable notifications.");await inspectPush()}
   finally{setPushBusy(false)}
 }
 async function disablePush(){
   setPushBusy(true);setPushMessage("");
   try{
     const registration=await navigator.serviceWorker.getRegistration("/");
     const subscription=await registration?.pushManager.getSubscription();
     if(subscription){await fetch("/api/push/unsubscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe()}
     setPushStatus("available");setPushMessage("Device notifications have been turned off.");
   }catch{setPushMessage("Unable to disable notifications right now.")}
   finally{setPushBusy(false)}
 }
 async function markAll(){
   const ids=items.filter(x=>!x.read_at).map(x=>x.id); if(!ids.length)return;
   const stamp=new Date().toISOString();
   await supabase.from("notifications").update({read_at:stamp}).in("id",ids);
   setItems(x=>x.map(n=>n.read_at?n:{...n,read_at:stamp}));
 }
 async function markOne(id:string){
   const stamp=new Date().toISOString();
   await supabase.from("notifications").update({read_at:stamp}).eq("id",id);
   setItems(x=>x.map(n=>n.id===id?{...n,read_at:stamp}:n));
 }
 return <section className="dashboard-content">
  <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / NOTIFICATIONS</span><h1>Stay informed.</h1><p>Important activity from your account appears here.</p></div><div className="header-actions"><button className="fund-btn secondary-dark" onClick={markAll}><CheckCheck size={16}/> Mark all read</button><Link className="fund-btn secondary-dark" href="/dashboard"><ArrowLeft size={16}/> Overview</Link></div></header>
  <section className="panel push-notification-panel"><div className="push-notification-copy"><span className="push-notification-icon"><Bell size={18}/></span><div><span className="eyebrow">DEVICE NOTIFICATIONS</span><h2>Stay ahead of important activity.</h2><p>Receive ZYNTH alerts on this device even when the app is not open. You control permission from your device.</p></div></div><div className="push-notification-action">{pushStatus==="enabled"?<><span className="push-status enabled"><i/> Notifications enabled</span><button className="fund-btn secondary-dark" disabled={pushBusy} onClick={disablePush}>{pushBusy?"Updating…":"Turn off"}</button></>:pushStatus==="denied"?<span className="push-status warning">Notifications are blocked in your device settings.</span>:pushStatus==="unsupported"?<span className="push-status warning">This device/browser does not support push notifications.</span>:<button className="fund-btn primary" disabled={pushBusy||pushStatus==="loading"} onClick={enablePush}>{pushBusy?"Enabling…":"Enable notifications"}</button>}</div>{pushMessage&&<small className="push-notification-message">{pushMessage}</small>}</section>
  <section className="panel notifications-panel">{loading?<div className="goal-empty">Loading notifications…</div>:items.length?<div className="notification-list">{items.map(n=>{const Icon=iconFor(n.type);return <button className={"notification-item "+(!n.read_at?"unread":"")} key={n.id} onClick={()=>markOne(n.id)}><span className="notification-icon"><Icon size={16}/></span><span className="notification-copy"><b>{n.title}</b><small>{n.body}</small><em>{new Date(n.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}</em></span>{!n.read_at&&<i/>}</button>})}</div>:<div className="goal-empty"><div className="empty-icon"><Bell size={20}/></div><h3>You're all caught up</h3><p>New account activity will appear here automatically.</p></div>}</section>
 </section>
}
