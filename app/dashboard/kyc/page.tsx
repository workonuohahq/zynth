"use client";
import{useEffect,useMemo,useState}from"react";import{useRouter,useSearchParams}from"next/navigation";import{ShieldCheck,AlertTriangle,CheckCircle2,ArrowRight,Plus}from"lucide-react";
export default function KycPage(){
 const router=useRouter(),params=useSearchParams(),returnTo=params.get("returnTo")||"";
 const[d,setD]=useState<any>(null),[f,setF]=useState<any>({}),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 useEffect(()=>{fetch("/api/kyc",{cache:"no-store"}).then(r=>r.json()).then(j=>{setD(j);setF({...j?.profile,...(j?.profile?.custom_data||{})})}).catch(()=>setMsg("Unable to load KYC form."))},[]);
 const fields=useMemo(()=>Array.isArray(d?.fields)?d.fields.filter((x:any)=>x.active!==false):[],[d]);
 const sections=useMemo(()=>Array.from(new Set(fields.map((x:any)=>x.section||"General"))),[fields]);
 const setValue=(key:string,value:any)=>setF((x:any)=>({...x,[key]:value}));
 async function save(){
  setBusy(true);setMsg("");
  const custom:any={};
  for(const field of fields)if(field.storage_mode==="custom")custom[field.storage_key||field.field_key]=f[field.storage_key||field.field_key]||"";
  const payload:any={custom};
  for(const field of fields)if(field.storage_mode==="core")payload[field.storage_key||field.field_key]=f[field.storage_key||field.field_key]||"";
  const r=await fetch("/api/kyc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const j=await r.json();
  if(!r.ok){setMsg(j.error||"Submission failed.");setBusy(false);return}
  setMsg("KYC information submitted for review.");
  const x=await fetch("/api/kyc",{cache:"no-store"});const latest=await x.json();setD(latest);setF({...latest?.profile,...(latest?.profile?.custom_data||{})});
  setBusy(false);
 }
 const status=d?.profile?.status||"NOT_STARTED";
 return <main className="dashboard-page"><section className="dashboard-hero"><span className="eyebrow">IDENTITY & COMPLIANCE</span><h1>Complete your KYC.</h1><p>Your verification profile protects your account and is required before withdrawals can be processed.</p></section>
 <div className="dashboard-card">
  <div className="kyc-status-head"><div><span className="muted">VERIFICATION STATUS</span><h2>{status.replaceAll("_"," ")}</h2></div><span className={"kyc-status "+(status==="VERIFIED"?"verified":"pending")}>{status==="VERIFIED"?<CheckCircle2 size={14}/>:<ShieldCheck size={14}/>} {status==="VERIFIED"?"Verified":"Action required"}</span></div>
  {["REJECTED","REVERIFICATION_REQUIRED"].includes(status)&&<div className="admin-warning"><AlertTriangle size={16}/> Additional information is required before verification can continue.</div>}
  {status==="VERIFIED"&&d?.profile?.expires_at&&<p className="muted">Verification expires {new Date(d.profile.expires_at).toLocaleDateString("en-NG")}.</p>}
  {sections.map(section=><section className="kyc-section" key={section}><div className="kyc-section-head"><div><span className="muted">KYC PROFILE</span><h3>{section}</h3></div></div><div className="profile-edit-grid">{fields.filter((x:any)=>(x.section||"General")===section).map((field:any)=>{
    const key=field.storage_key||field.field_key,value=f[key]??"",opts=Array.isArray(field.options)?field.options:[];
    return <label key={field.id||field.field_key}><span>{field.label}{field.required&&<b> *</b>}</span>
      {field.field_type==="textarea"?<textarea rows={4} value={value} onChange={e=>setValue(key,e.target.value)} placeholder={field.help_text||""}/>:field.field_type==="select"?<select value={value} onChange={e=>setValue(key,e.target.value)}><option value="">Select…</option>{opts.map((o:any)=><option key={String(o.value??o)} value={String(o.value??o)}>{String(o.label??o)}</option>)}</select>:<input type={field.field_type==="date"?"date":"text"} value={value} onChange={e=>setValue(key,e.target.value)} placeholder={field.help_text||""}/>}
      {field.help_text&&<small>{field.help_text}</small>}
    </label>
  })}</div></section>)}
  {!fields.length&&<div className="admin-warning">KYC form configuration is currently unavailable. Please contact support.</div>}
  <div className="kyc-submit-row"><button className="primary" disabled={busy||!fields.length} onClick={save}><ShieldCheck size={15}/>{busy?"Submitting…":"Submit for review"}</button>{returnTo&&status==="VERIFIED"&&<button className="secondary-btn" onClick={()=>router.replace(returnTo)}>Continue <ArrowRight size={15}/></button>}</div>
  {msg&&<p>{msg}</p>}
 </div>
 <style jsx>{`
 .kyc-status-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.kyc-status-head h2{margin:6px 0 0;font-size:22px;letter-spacing:-.03em}.kyc-status{display:inline-flex;align-items:center;gap:7px;border:1px solid #4b3c21;background:#1b160e;color:#d9b871;border-radius:999px;padding:8px 11px;font-size:9px;font-weight:900;text-transform:uppercase}.kyc-status.verified{color:#9fd0b0;border-color:#284a37;background:#101b15}.kyc-section{border:1px solid #242424;border-radius:15px;background:#0d0d0d;padding:16px;margin:14px 0}.kyc-section-head{margin-bottom:12px}.kyc-section-head h3{margin:5px 0 0;font-size:15px}.kyc-section .profile-edit-grid{margin-top:0}.kyc-section label{display:flex;flex-direction:column;gap:7px}.kyc-section label span{font-size:10px;color:#aaa;font-weight:800}.kyc-section label span b{color:#d9b871}.kyc-section input,.kyc-section textarea,.kyc-section select{width:100%;box-sizing:border-box;background:#090909;border:1px solid #292929;color:#eee;border-radius:9px;padding:11px;font:inherit;outline:none}.kyc-section textarea{resize:vertical}.kyc-section input:focus,.kyc-section textarea:focus,.kyc-section select:focus{border-color:#6a542b}.kyc-section small{color:#5f5f5f;font-size:8px;line-height:1.4}.kyc-submit-row{display:flex;gap:9px;align-items:center;margin-top:16px}.kyc-submit-row .primary,.kyc-submit-row .secondary-btn{display:inline-flex;align-items:center;gap:7px}.kyc-submit-row .secondary-btn{background:#171717;border:1px solid #2d2d2d;color:#aaa;padding:10px 13px;border-radius:9px}
 @media(max-width:650px){.kyc-status-head{align-items:flex-start;flex-direction:column}.kyc-submit-row{flex-direction:column;align-items:stretch}.kyc-submit-row button{justify-content:center}}
 `}</style>
 </main>
}