"use client";

import {useEffect} from "react";

const fingerprintFor=(publicKey:string)=>`zynth-vapid:${String(publicKey).slice(0,16)}`;

async function healPushSubscription(){
  if(typeof window==="undefined") return;
  if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  if(Notification.permission!=="granted") return;

  const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  await navigator.serviceWorker.ready;

  const configResponse=await fetch("/api/push/config",{cache:"no-store"});
  if(!configResponse.ok) return;
  const config=await configResponse.json().catch(()=>({}));
  if(!config.publicKey) return;

  const keyFingerprint=fingerprintFor(config.publicKey);
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription) return;

  const healthResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(subscription.endpoint),{cache:"no-store"});
  const health=await healthResponse.json().catch(()=>null);
  const serverActive=healthResponse.ok && health?.active===true;
  const previousFingerprint=window.localStorage.getItem("zynth-vapid-fingerprint");

  if(serverActive && previousFingerprint===keyFingerprint) return;

  await subscription.unsubscribe().catch(()=>false);
  subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,
    applicationServerKey:config.publicKey
  });

  const payload=subscription.toJSON();
  if(!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) return;

  const response=await fetch("/api/push/subscribe",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      endpoint:payload.endpoint,
      keys:payload.keys,
      userAgent:navigator.userAgent
    })
  });
  if(!response.ok) return;

  const verifyResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(payload.endpoint),{cache:"no-store"});
  const verify=await verifyResponse.json().catch(()=>null);
  if(verifyResponse.ok && verify?.active===true){
    window.localStorage.setItem("zynth-vapid-fingerprint",keyFingerprint);
  }
}

export default function PushNotificationManager(){
  useEffect(()=>{
    healPushSubscription().catch(()=>{});
  },[]);
  return null;
}
