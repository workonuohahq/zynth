"use client";
import {useEffect,useState} from "react";
import {Copy,Gift,Link as LinkIcon,RefreshCw,ShieldCheck,Target,UsersRound,WalletCards} from "lucide-react";

const money=(n:any)=>`₦${Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function ZpaDesk(){
 const[data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 async function load(){
  setLoading(true);
  try{const r=await fetch("/api/zpa",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Unable to load ZPA desk.");setData(j);}
  catch(e){setMessage(e instanceof Error?e.message:"Unable to load ZPA desk.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{load()},[]);
 async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);setMessage(label+" copied.");}catch{setMessage("Copy failed. Select the link manually.");}}
 if(loading)return <section className="dashboard-content"><div className="trader-loading"><RefreshCw className="spin" size={18}/><span>Loading your ZPA desk…</span></div></section>;
 const s=data?.settings||{}, q=Number(data?.qualified_investors||0), next=Number(data?.next_milestone||0);
 return <section className="dashboard-content">
  <header className="dashboard-header premium-header"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / ZPA</span><span className="live-dot"><i/> PARTNER NETWORK</span></div><h1>ZPA Desk</h1><p>Acquire genuine first-time ZYNTH investors. Your acquisition incentives never repeat on top-ups or recurring investments.</p></div><button className="ghost" onClick={load}><RefreshCw size={15}/> Refresh</button></header>
  {message&&<div className="admin-notice">{message}</div>}
  <section className="wealth-hero"><div className="wealth-main"><div className="wealth-label"><span>Available ZPA earnings</span><span className="secure-chip"><ShieldCheck size={13}/> Existing wallet</span></div><strong>{money(data?.available)}</strong><div className="wealth-breakdown"><span><i className="dot available"/> Qualified capital {money(data?.qualified_capital)}</span><span><i className="dot locked"/> Capital rate {Number(s.capital_incentive_rate||0).toFixed(2)}%</span></div></div><div className="wealth-side"><div><span>Qualifying…</span><b>{money(data?.qualifying)}</b></div><div><span>Pending</span><b>{money(data?.pending)}</b></div><div><span>Month-end withheld</span><b>{money(data?.month_end_withheld)}</b></div><div><span>Capital incentives</span><b>{money(data?.capital_incentives_earned)}</b></div><div><span>Milestone incentives</span><b>{money(data?.milestone_incentives_earned)}</b></div></div></section>
  <div className="dashboard-grid">
   <section className="panel portfolio-panel"><div className="panel-head"><div><span className="muted">MONTHLY ACQUISITION</span><h2>Progress</h2></div><span className="admin-count">{q} qualified</span></div><div className="health-row"><span>Qualified investors</span><b className="ok">{q}</b></div><div className="health-row"><span>Next milestone</span><b>{next?next:"All configured milestones reached"}</b></div><div className="health-row"><span>Next reward</span><b>{money(data?.next_reward)}</b></div><div className="notice">Monthly milestones reset by cycle. Historical earnings remain permanent.</div></section>
   <section className="panel portfolio-panel"><div className="panel-head"><div><span className="muted">ACQUISITION LINK</span><h2>Bring an investor</h2></div><LinkIcon size={18}/></div><div className="money-input"><input readOnly value={typeof window!=="undefined"?window.location.origin+data.link:data.link}/><button className="details" onClick={()=>copy((typeof window!=="undefined"?window.location.origin:"")+data.link,"ZPA link")}><Copy size={14}/> Copy</button></div><small className="muted">This is separate from ordinary referral rewards. ZPA attribution takes precedence for acquisition earnings.</small></section>
  </div>
  <section className="panel"><div className="panel-head"><div><span className="muted">ZPA CODE</span><h2>Your acquisition code</h2></div><Target size={18}/></div><div className="money-input"><input readOnly value={data.code||""}/><button className="details" onClick={()=>copy(data.code||"","ZPA code")}><Copy size={14}/> Copy</button></div></section>
  <section className="panel"><div className="panel-head"><div><span className="muted">ACQUISITION HISTORY</span><h2>Your investors</h2></div><UsersRound size={18}/></div><div className="admin-table">{(data.acquisitions||[]).map((a:any)=><div className="admin-row" key={a.id}><div className="admin-person"><span className="avatar"><UsersRound size={14}/></span><span><b>{a.investor_name}</b><small>{a.status==="qualifying"?"Qualifying · due "+new Date(a.qualification_due_at).toLocaleDateString("en-NG"):a.status}</small></span></div><span>{a.first_investment_amount?money(a.first_investment_amount):"Awaiting investment"}</span><strong>{a.status}</strong></div>)}{!(data.acquisitions||[]).length&&<div className="admin-empty"><UsersRound size={22}/><p>No acquisitions yet.</p></div>}</div></section>
  <section className="panel"><div className="panel-head"><div><span className="muted">EARNINGS LEDGER</span><h2>Immutable incentive history</h2></div><WalletCards size={18}/></div><div className="admin-table">{(data.earnings||[]).map((e:any)=><div className="admin-row" key={e.id}><div className="admin-person"><span className="avatar">{e.earning_type==="milestone"?<Gift size={14}/>:<Target size={14}/>}</span><span><b>{e.earning_type==="milestone"?"Monthly milestone":"Capital incentive"}</b><small>{e.status.replaceAll("_"," ")}{e.milestone_threshold?" · "+e.milestone_threshold+" qualified":""}</small></span></div><span>{money(e.amount)}</span><strong>{e.status}</strong></div>)}{!(data.earnings||[]).length&&<div className="admin-empty"><WalletCards size={22}/><p>No incentive records yet.</p></div>}</div></section>
 </section>
}
