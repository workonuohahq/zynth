"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {Headphones,MessageCircle} from "lucide-react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
export default function SupportLauncher(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const[unread,setUnread]=useState(0);
 useEffect(()=>{
  let mounted=true;
  const load=async()=>{try{const r=await fetch("/api/support",{cache:"no-store"});const j=await r.json();if(mounted)setUnread((j.tickets||[]).reduce((n:any,t:any)=>n+Number(t.user_unread_count||0),0))}catch{}};
  load();
  const channel=supabase.channel("zynth-support-launcher").on("postgres_changes",{event:"*",schema:"public",table:"zynth_support_tickets"},load).on("postgres_changes",{event:"INSERT",schema:"public",table:"zynth_support_messages"},load).subscribe();
  const timer=setInterval(load,30000);
  return()=>{mounted=false;clearInterval(timer);supabase.removeChannel(channel)};
 },[supabase]);
 const label=unread?"Customer support, "+unread+" unread message"+(unread===1?"":"s"):"Customer support";
 return <Link href="/dashboard/support" className="support-launcher" aria-label={label}><span className="support-launcher-icon"><Headphones size={20}/></span><span className="support-launcher-copy"><b>Support</b><small>We're here to help</small></span>{unread>0&&<span className="support-launcher-badge">{unread>99?"99+":unread}</span>}<span className="support-launcher-ping"><MessageCircle size={12}/></span></Link>
}