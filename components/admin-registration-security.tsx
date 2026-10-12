"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";

export default function AdminRegistrationSecurity() {
  const [enabled,setEnabled]=useState(true);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [updatedAt,setUpdatedAt]=useState("");
  async function load() {
    setLoading(true);
    try {
      const response=await fetch("/api/admin/registration-security",{cache:"no-store"});
      const json=await response.json();
      if(!response.ok) throw new Error(json.error||"Could not load security settings.");
      setEnabled(json.settings?.human_check_enabled!==false);
      setUpdatedAt(json.settings?.updated_at||"");
    } catch(error) { setMessage(error instanceof Error?error.message:"Could not load security settings."); }
    finally { setLoading(false); }
  }
  useEffect(()=>{void load()},[]);
  async function save(next:boolean) {
    setSaving(true);setMessage("");
    try {
      const response=await fetch("/api/admin/registration-security",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({humanCheckEnabled:next})});
      const json=await response.json();
      if(!response.ok) throw new Error(json.error||"Could not save security setting.");
      setEnabled(json.settings.human_check_enabled);setUpdatedAt(json.settings.updated_at);setMessage(next?"Human Check enabled. New registrations must pass server verification.":"Human Check disabled. Registration rate limits remain active.");
    } catch(error) { setMessage(error instanceof Error?error.message:"Could not save security setting."); }
    finally { setSaving(false); }
  }
  return <section className="admin-card" style={{marginTop:16}}>
    <div className="admin-card-head"><div><span className="muted">REGISTRATION SECURITY</span><h2>ZYNTH Human Check</h2><p>Control the server-enforced human verification challenge used before new accounts are created.</p></div><ShieldCheck size={23}/></div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",padding:"16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}><span style={{width:42,height:42,borderRadius:12,display:"grid",placeItems:"center",background:enabled?"rgba(184,139,62,.12)":"var(--panel2)",color:enabled?"var(--gold-bright)":"var(--muted)"}}>{enabled?<ShieldCheck size={20}/>:<ShieldAlert size={20}/>}</span><div><b style={{display:"block"}}>{loading?"Checking setting…":enabled?"Human verification enabled":"Human verification disabled"}</b><small style={{color:"var(--muted)"}}>{enabled?"Valid, unused challenge required for signup.":"Signup continues with server-side rate limits."}</small></div></div>
      <button className={enabled?"reject":"approve"} disabled={loading||saving} onClick={()=>void save(!enabled)}>{saving?"Saving…":enabled?"Disable Human Check":"Enable Human Check"}</button>
    </div>
    {message&&<p role="status" style={{fontSize:12,margin:"8px 0"}}>{message}</p>}
    {updatedAt&&<small style={{color:"var(--muted)"}}>Last changed {new Date(updatedAt).toLocaleString()}</small>}
    <div className="zt-warning" style={{marginTop:14}}><span>Security rule: if the setting cannot be read, registration fails closed. Turning this off does not disable rate limiting or account security.</span></div>
  </section>;
}
