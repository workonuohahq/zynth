"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Flag, Plus, Target, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Goal = { id:string; name:string; target_amount:number|string; target_date:string|null; status:string; created_at:string };
const money=(v:number)=>"₦"+Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:0,maximumFractionDigits:2});

export default function GoalsClient(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [goals,setGoals]=useState<Goal[]>([]);
 const [position,setPosition]=useState(0);
 const [name,setName]=useState("");
 const [target,setTarget]=useState("");
 const [targetDate,setTargetDate]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");

 async function load(){
   setLoading(true);
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return;}
   const [{data:g},{data:u}]=await Promise.all([
     supabase.from("goals").select("id,name,target_amount,target_date,status,created_at").eq("user_id",user.id).eq("status","active").order("created_at",{ascending:false}),
     supabase.from("users").select("main_wallet_balance,locked_vault_balance").eq("id",user.id).single()
   ]);
   setGoals((g||[]) as Goal[]);
   setPosition(Number(u?.main_wallet_balance||0)+Number(u?.locked_vault_balance||0));
   setLoading(false);
 }
 useEffect(()=>{load()},[]);

 async function createGoal(e:FormEvent){
   e.preventDefault(); setMessage("");
   const amount=Number(target);
   if(!name.trim()||!amount||amount<=0){setMessage("Enter a goal name and a valid target amount.");return}
   setSaving(true);
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setMessage("Your session has expired. Sign in again.");setSaving(false);return}
   const {error}=await supabase.from("goals").insert({user_id:user.id,name:name.trim(),target_amount:amount,target_date:targetDate||null});
   if(error)setMessage(error.message); else {setName("");setTarget("");setTargetDate("");setMessage("Goal created.");await load();}
   setSaving(false);
 }
 async function removeGoal(id:string){
   const {error}=await supabase.from("goals").delete().eq("id",id);
   if(error)setMessage(error.message); else setGoals(g=>g.filter(x=>x.id!==id));
 }
 return <section className="dashboard-content">
   <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / GOALS</span><h1>Build toward something.</h1><p>Track a target against your current total position. Goals never move money by themselves.</p></div><Link className="fund-btn secondary-dark" href="/dashboard"><ArrowLeft size={16}/> Overview</Link></header>
   <div className="goals-layout">
    <section className="panel goal-create"><div className="goal-icon"><Target size={22}/></div><span className="muted">NEW GOAL</span><h2>Set a target</h2><p className="copy">Your progress is calculated from your available balance plus active vault principal.</p>
      <form onSubmit={createGoal} className="goal-form">
       <label><span>GOAL NAME</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Emergency fund" maxLength={60}/></label>
       <label><span>TARGET AMOUNT</span><div className="goal-input"><b>₦</b><input value={target} onChange={e=>setTarget(e.target.value.replace(/[^0-9.]/g,""))} inputMode="decimal" placeholder="100000"/></div></label>
       <label><span>TARGET DATE <em>OPTIONAL</em></span><input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>
       <button className="primary full-button" disabled={saving}><Plus size={16}/>{saving?"Creating…":"Create goal"}</button>
       {message&&<div className="form-feedback">{message}</div>}
      </form>
    </section>
    <section className="panel goals-list"><div className="panel-head"><div><span className="muted">YOUR GOALS</span><h2>Progress</h2></div><span className="goal-position">Position {money(position)}</span></div>
      {loading?<div className="goal-empty">Loading goals…</div>:goals.length?<div className="goal-items">{goals.map(g=>{
       const pct=Math.min(100,Math.max(0,position/Number(g.target_amount)*100));
       return <article className="goal-item" key={g.id}>
         <div className="goal-top"><div><b>{g.name}</b><small>{g.target_date ? "Target "+new Date(g.target_date+"T00:00:00").toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"}) : "No target date"}</small></div><button className="goal-delete" onClick={()=>removeGoal(g.id)} aria-label={"Delete "+g.name}><Trash2 size={15}/></button></div>
         <div className="goal-amounts"><strong>{money(position)}</strong><span>of {money(Number(g.target_amount))}</span></div>
         <div className="goal-track"><span style={{width:pct+"%"}}/></div>
         <div className="goal-bottom"><span>{pct.toFixed(0)}% complete</span>{pct>=100?<b className="goal-complete"><CheckCircle2 size={13}/> Target reached</b>:<span>{money(Math.max(0,Number(g.target_amount)-position))} remaining</span>}</div>
       </article>
      })}</div>:<div className="goal-empty"><div className="empty-icon"><Flag size={20}/></div><h3>No active goals</h3><p>Create a target and keep your progress visible without locking any additional funds.</p></div>}
    </section>
   </div>
   <section className="panel goal-note"><CheckCircle2 size={18}/><div><b>Goals are tracking only</b><p>Creating a goal does not reserve, invest, or withdraw money. Vaults remain the only feature that locks funds.</p></div><Link className="text-action" href="/dashboard/vaults">Open vaults <ArrowUpRight size={14}/></Link></section>
 </section>
}
