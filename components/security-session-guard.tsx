"use client";
import {useEffect} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
const KEY="zynth-security-session-key", ID="zynth-security-session-id";
function randomKey(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("");}
export default function SecuritySessionGuard(){
 useEffect(()=>{let stopped=false;
  const register=async()=>{
   let sessionKey=localStorage.getItem(KEY)||randomKey();
   const existingId=localStorage.getItem(ID);
   if(existingId){
    const hb=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"heartbeat",sessionKey})});
    const hd=await hb.json().catch(()=>null);
    if(hb.ok&&hd?.active===true)return;
    localStorage.removeItem(KEY);localStorage.removeItem(ID);sessionKey=randomKey();
   }
   const res=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"register",sessionKey,appMode:window.matchMedia("(display-mode: standalone)").matches?"standalone":"browser"})});
   const d=await res.json().catch(()=>null);
   if(res.ok&&d?.sessionId){localStorage.setItem(KEY,d.sessionKey||sessionKey);localStorage.setItem(ID,d.sessionId);}
  };
  const heartbeat=async()=>{const key=localStorage.getItem(KEY);if(!key)return;const res=await fetch("/api/security/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"heartbeat",sessionKey:key})});const d=await res.json().catch(()=>null);if(!stopped&&res.ok&&d?.active===false){localStorage.removeItem(KEY);localStorage.removeItem(ID);await createSupabaseBrowserClient().auth.signOut({scope:"local"});window.location.href="/login?security=revoked";}};
  void register();const timer=window.setInterval(()=>void heartbeat(),30000);return()=>{stopped=true;window.clearInterval(timer)};
 },[]);return null;
}
