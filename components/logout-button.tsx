"use client";

import { useState } from "react";
import { LogOut, X, ShieldCheck } from "lucide-react";

export default function LogoutButton(){
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);

  async function logout(){
    setBusy(true);
    try{
      const res=await fetch("/auth/signout",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"}});
      if(res.redirected){ window.location.assign(res.url); return; }
      window.location.assign("/login");
    }catch{
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="logout-button" onClick={()=>setOpen(true)} disabled={busy}>
      <LogOut size={16}/><span>{busy?"Signing out…":"Sign out"}</span>
    </button>
    {open && <div className="logout-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setOpen(false)}}>
      <section className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
        <button type="button" className="logout-dialog-close" aria-label="Close" onClick={()=>setOpen(false)} disabled={busy}><X size={18}/></button>
        <div className="logout-dialog-icon"><ShieldCheck size={24}/></div>
        <span className="account-logout-kicker">SECURE SESSION</span>
        <h3 id="logout-title">Sign out of ZYNTH?</h3>
        <p>Your current session will be ended on this device. You can sign back in whenever you’re ready.</p>
        <div className="logout-dialog-actions">
          <button type="button" className="logout-cancel" onClick={()=>setOpen(false)} disabled={busy}>Cancel</button>
          <button type="button" className="logout-confirm" onClick={logout} disabled={busy}><LogOut size={16}/>{busy?"Signing out…":"Sign out"}</button>
        </div>
      </section>
    </div>}
  </>;
}
