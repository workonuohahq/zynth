"use client";

import {useEffect,useState} from "react";
import {Bell,Check,ShieldCheck,Smartphone} from "lucide-react";

type PushStatus="loading"|"unsupported"|"denied"|"enabled"|"available"|"error";

export default function AdminPushPrompt(){
 const [status,setStatus]=useState<PushStatus>("loading");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");

 async function inspect(){
  if(typeof window==="undefined"||!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window)){setStatus("unsupported");return;}
  if(Notification.permission==="denied"){setStatus("denied");return;}
  try{
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   const subscription=await registration.pushManager.getSubscription();
   setStatus(subscription?"enabled":"available");
  }catch{setStatus("error");}
 }

 useEffect(()=>{void inspect()},[]);

 async function enable(){
  setBusy(true);setMessage("");
  try{
   if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window))throw new Error("Push notifications are not supported on this device.");
   const permission=await Notification.requestPermission();
   if(permission!=="granted"){
    setStatus(permission==="denied"?"denied":"available");
    throw new Error(permission==="denied"?"Notifications are blocked. Allow them in your device settings.":"Notification permission was not granted.");
   }
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   await navigator.serviceWorker.ready;
   const configResponse=await fetch("/api/push/config",{cache:"no-store"});
   if(!configResponse.ok)throw new Error("Push service is temporarily unavailable.");
   const config=await configResponse.json();
   if(!config.publicKey)throw new Error("Push service is not configured yet.");
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:config.publicKey});
   const payload=subscription.toJSON();
   const response=await fetch("/api/push/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:payload.endpoint,keys:payload.keys,userAgent:navigator.userAgent})});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||"Unable to activate notifications.");}
   setStatus("enabled");
   setMessage("This device is now registered for ZYNTH admin alerts.");
  }catch(error){
   setMessage(error instanceof Error?error.message:"Unable to enable notifications.");
   void inspect();
  }finally{setBusy(false);}
 }

 if(status==="unsupported"||status==="loading")return null;

 return <section className="panel push-notification-panel admin-push-prompt" aria-label="Admin device notifications">
  <div className="push-notification-copy">
   <span className="push-notification-icon">{status==="enabled"?<Check size={18}/>:<Bell size={18}/>}</span>
   <div>
    <span className="eyebrow">ADMIN DEVICE NOTIFICATIONS</span>
    <h2>{status==="enabled"?"Admin notifications are active on this device.":"Never miss an admin action."}</h2>
    <p>{status==="enabled"?"You’ll receive important money movement, support, trader, security and operational alerts on this device.":"Enable device alerts for deposits, withdrawals, redemptions, support requests, trader activity, security events and other admin attention items — even when the admin panel is not open."}</p>
   </div>
  </div>
  <div className="push-notification-action">
   {status==="enabled"?<span className="push-status enabled"><i/> Active</span>:status==="denied"?<span className="push-status warning">Blocked in device settings</span>:<button className="fund-btn primary" disabled={busy} onClick={enable} type="button"><Smartphone size={16}/>{busy?"Enabling…":"Enable notifications"}</button>}
  </div>
  {status==="enabled"&&<small className="push-notification-message"><ShieldCheck size={12}/> Protected admin device subscription</small>}
  {message&&status!=="enabled"&&<small className="push-notification-message">{message}</small>}
 </section>;
}
