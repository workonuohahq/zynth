"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {CheckCircle2,Mail,Search,ShieldCheck,UserRound,UsersRound,XCircle} from "lucide-react";

type Row={id:string;email:string|null;full_name:string|null;role:string;roles?:{key:string;name:string}[];kyc_verified:boolean;account_status:string;main_wallet_balance:number;portfolio_value:number;investment_count:number;active_investments:number;total_deposited:number;total_withdrawn:number;created_at:string;email_verified:boolean;email_reverification_required:boolean};
const money=(n:any)=>`₦${Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2})}`;

export default function AdminUsers({initialUsers,refreshKey}:{initialUsers:Row[];refreshKey?:number}){
 const[rows,setRows]=useState<Row[]>(initialUsers||[]),[q,setQ]=useState(""),[loading,setLoading]=useState(false),[busy,setBusy]=useState("");
 async function load(){setLoading(true);try{const p=new URLSearchParams();if(q.trim())p.set("q",q.trim());const r=await fetch("/api/admin/users?"+p.toString(),{cache:"no-store"});const d=await r.json();setRows(d.items||[])}finally{setLoading(false)}}
 useEffect(()=>{load()},[refreshKey]);
 return <div>
  <div style={{display:"flex",gap:10,marginBottom:18}}>
   <div className="money-input" style={{flex:1}}><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()} placeholder="Search name, email or ID"/></div>
   <button className="primary" onClick={load} disabled={loading}>{loading?"Searching…":"Search"}</button>
  </div>
  <div className="admin-table">
   {rows.map(r=><div className="admin-row" key={r.id}>
    <div className="admin-person"><span className="avatar"><UserRound size={14}/></span><span><b>{r.full_name||"Unnamed account"}</b><small>{r.email||r.id}</small><span className="role-chip-row">{(r.roles||[]).map(x=><em className={"role-chip role-"+x.key} key={x.key}>{x.name}</em>)}</span></span></div>
    <span>{money(r.portfolio_value)}</span><span>{r.active_investments} active</span>
    <span className={r.kyc_verified?"status-text completed":"status-text pending"}>{r.kyc_verified?"KYC verified":"KYC pending"}</span>
    <span className={r.email_verified?"status-text completed":"status-text pending"}>{r.email_verified?"Email verified":"Email required"}</span>
    <button
      className={"email-verification-toggle "+(r.email_verified?"on":"off")}
      title={r.email_verified?"Require this investor to verify again":"Email verification is required"}
      disabled={busy===r.id}
      onClick={async()=>{
        const next=!r.email_verified;
        if(!next&&!window.confirm("Require this investor to verify their email again? Their current email verification will be invalidated and dashboard access will be locked until they confirm a new link.")) return;
        setBusy(r.id);
        try{
          const res=await fetch("/api/admin/users/"+r.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"email_verification",verified:next})});
          const j=await res.json();
          if(!res.ok) throw new Error(j.error||"Email verification update failed.");
          setRows(xs=>xs.map(x=>x.id===r.id?{...x,email_verified:Boolean(j.verified),email_reverification_required:Boolean(j.reverification_required)}:x));
        }catch(e){window.alert(e instanceof Error?e.message:"Email verification update failed.");}
        finally{setBusy("")}
      }}
      aria-label={r.email_verified?"Require email re-verification":"Email verification required"}
    >{busy===r.id?"…":r.email_verified?<CheckCircle2 size={14}/>:<XCircle size={14}/>}</button>
    <Link className="details" href={"/admin/users/"+r.id}><ShieldCheck size={14}/> Manage</Link>
   </div>)}
   {!rows.length&&<div className="admin-empty"><UsersRound size={22}/><p>No accounts found.</p></div>}
  </div>
 </div>
}
