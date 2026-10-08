"use client";

import {useEffect} from "react";

async function ensurePushSubscription(){
  if(typeof window==="undefined") return;
  if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  if(Notification.permission!=="granted") return;

  const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  await navigator.serviceWorker.ready;

  const configResponse=await fetch("/api/push/config",{cache:"no-store"});
  if(!configResponse.ok) return;
  const config=await configResponse.json().catch(()=>({}));
  if(!config.publicKey) return;

  let subscription=await registration.pushManager.getSubscription();

  if(subscription){
    const healthResponse=await fetch("/api/push/status?endpoint="+encodeURIComponent(subscription.endpoint),{cache:"no-store"});
    const health=await healthResponse.json().catch(()=>null);
    if(healthResponse.ok && health?.active===true) return;

    await subscription.unsubscribe().catch(()=>false);
    subscription=null;
  }

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
  if(!verifyResponse.ok || verify?.active!==true){
    await subscription.unsubscribe().catch(()=>false);
  }
}

export default function PushNotificationManager(){
  useEffect(()=>{
    ensurePushSubscription().catch(()=>{});
  },[]);
  return null;
}
