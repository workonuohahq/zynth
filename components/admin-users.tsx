"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, UserRound, ShieldCheck, WalletCards, Vault, ChevronRight, RefreshCw } from "lucide-react";

type UserRow = {
  id:string; email:string; full_name:string|null; role:string; kyc_verified:boolean; account_status:string;
  main_wallet_balance:number; locked_vault_balance:number; created_at:string; last_sign_in_at:string|null;
  vault_count:number; active_vaults:number; total_deposited:number; total_withdrawn:number; zpa_earnings:number;
  pending_deposits:number; pending_withdrawals:number;
};

const naira=(n:number)=>`₦${Number(n||0).toLocaleString("en-NG",{maximumFractionDigits:2})}`;
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"Never";

export default function AdminUsers({initialUsers}:{initialUsers:UserRow[]}) {
  const [rows,setRows]=useState<UserRow[]>(initialUsers||[]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [kyc,setKyc]=useState("");
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState("");

  const load=async()=>{
    setLoading(true);setNotice("");
    try{
      const params=new URLSearchParams();
      if(search.trim())params.set("q",search.trim());
      if(status)params.set("status",status);
      if(kyc)params.set("kyc",kyc);
      const r=await fetch("/api/admin/users?"+params.toString(),{cache:"no-store"});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Unable to load users.");
      setRows(j.items||[]);
    }catch(e){setNotice(e instanceof Error?e.message:"Unable to load users.");}
    finally{setLoading(false);}
  };

  useEffect(()=>{const t=setTimeout(()=>load(),260);return()=>clearTimeout(t);},[search,status,kyc]);

  return <div className="admin-users">
    <div className="user-command-toolbar">
      <div className="user-search">
        <Search size={16}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email or user ID…" aria-label="Search users"/>
        {search&&<button onClick={()=>setSearch("")} aria-label="Clear search">×</button>}
      </div>
      <div className="user-filters">
        <label><SlidersHorizontal size={14}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All status</option><option value="active">Active</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option></select></label>
        <select value={kyc} onChange={e=>setKyc(e.target.value)}><option value="">All KYC</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select>
        <button className="ghost compact-refresh" onClick={load} disabled={loading}><RefreshCw size={14}/>{loading?"":"Refresh"}</button>
      </div>
    </div>

    {notice&&<div className="admin-notice">{notice}</div>}

    <div className="user-directory-head"><span>{rows.length} shown</span><small>Search and filters update automatically</small></div>

    <div className="admin-user-table">
      <div className="admin-user-table-head"><span>User</span><span>Account</span><span>Available</span><span>Vaulted</span><span>Activity</span><span></span></div>
      {rows.map(u=><Link href={`/admin/users/${u.id}`} className="admin-user-row" key={u.id}>
        <div className="admin-person"><span className="avatar">{(u.full_name||u.email||"U").slice(0,1).toUpperCase()}</span><span><b>{u.full_name||"Unnamed user"}</b><small>{u.email}</small><code>{u.id.slice(0,8)}…</code></span></div>
        <div className="user-account-cell"><span className={`user-status ${u.account_status}`}>{u.account_status}</span><small>{u.kyc_verified?"KYC verified":"KYC pending"}</small></div>
        <strong>{naira(u.main_wallet_balance)}</strong>
        <strong>{naira(u.locked_vault_balance)}</strong>
        <div className="user-activity-cell"><span><Vault size={13}/>{u.active_vaults} active</span><small>Joined {date(u.created_at)}</small></div>
        <span className="user-open"><ChevronRight size={17}/></span>
      </Link>)}
      {!rows.length&&!loading&&<div className="admin-empty"><UserRound size={22}/><p>No users match the current view.</p></div>}
    </div>
  </div>;
}
