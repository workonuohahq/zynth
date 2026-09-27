"use client";

import {useEffect} from "react";

export default function PushNotificationManager(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{});
  },[]);
  return null;
}
