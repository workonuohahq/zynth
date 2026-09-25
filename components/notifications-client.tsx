"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeft, Bell, CheckCheck, CircleDollarSign, LockKeyhole, WalletCards } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Notice={id:string;title:string;body:string;type:string;read_at:string|null;created_at:string};
const iconFor=(type:string)=>type==="deposit"?WalletCards:type==="vault"?LockKeyhole:type==="withdrawal"?ArrowDownLeft:CircleDollarSign;

export default function NotificationsClient(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [items,setItems]=useState<Notice[]>([]);
 const [loading,setLoading]=useState(true);
 async function load(){
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return}
   const {data}=await supabase.from("notifications").select("id,title,body,type,read_at,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
   setItems((data||[]) as Notice[]); setLoading(false);
 }
 useEffect(()=>{load()},[]);
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
  <section className="panel notifications-panel">{loading?<div className="goal-empty">Loading notifications…</div>:items.length?<div className="notification-list">{items.map(n=>{const Icon=iconFor(n.type);return <button className={"notification-item "+(!n.read_at?"unread":"")} key={n.id} onClick={()=>markOne(n.id)}><span className="notification-icon"><Icon size={16}/></span><span className="notification-copy"><b>{n.title}</b><small>{n.body}</small><em>{new Date(n.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}</em></span>{!n.read_at&&<i/>}</button>})}</div>:<div className="goal-empty"><div className="empty-icon"><Bell size={20}/></div><h3>You're all caught up</h3><p>New account activity will appear here automatically.</p></div>}</section>
 </section>
}
