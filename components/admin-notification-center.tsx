"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Bell,CheckCircle2,CheckCheck,Copy,Edit3,Eye,Filter,Plus,Power,Search,ShieldAlert,ShieldCheck,Trash2,X,ChevronRight,Clock3,WalletCards,TrendingUp,Headphones} from "lucide-react";

const cats=["all","money","investment","performance","trader","account","custom"];
const blank={id:null,event_key:"",name:"",description:"",category:"custom",title:"",body:"",notification_type:"activity",enabled:true,system_event:false,variables:[]};
type Notice={id:string;title:string;body:string;type:string;read_at:string|null;created_at:string;updated_at?:string;metadata?:Record<string,any>};

function noticeIcon(n:Notice){
 const t=String(n.type||"");
 if(t==="money")return <WalletCards size={15}/>;
 if(t==="investment"||t==="trader")return <TrendingUp size={15}/>;
 if(t==="support")return <Headphones size={15}/>;
 if(t==="security")return <ShieldAlert size={15}/>;
 return <Bell size={15}/>;
}
function timeAgo(v:string){const m=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/60000));if(m<1)return"Just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";}

export default function AdminNotificationCenter({initialTemplates=[],refreshKey}:{initialTemplates?:any[];refreshKey?:number}){
 const [items,setItems]=useState<any[]>(initialTemplates),[editing,setEditing]=useState<any>(null),[query,setQuery]=useState(""),[cat,setCat]=useState("all"),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const [live,setLive]=useState<Notice[]>([]),[liveFilter,setLiveFilter]=useState<"attention"|"unread"|"all">("attention"),[liveLoading,setLiveLoading]=useState(true),[liveError,setLiveError]=useState("");
 const filtered=useMemo(()=>items.filter(x=>(cat==="all"||x.category===cat)&&(!query||[x.name,x.event_key,x.title,x.body].join(" ").toLowerCase().includes(query.toLowerCase()))),[items,cat,query]);
 const filteredLive=useMemo(()=>live.filter(n=>{if(liveFilter==="all")return true;if(liveFilter==="unread")return !n.read_at;return !n.read_at && ["attention","critical"].includes(String(n.metadata?.priority||"normal"));}),[live,liveFilter]);

 const loadLive=useCallback(async()=>{
  setLiveLoading(true);setLiveError("");
  try{const r=await fetch("/api/admin/notifications?limit=50",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"Could not load admin notifications.");setLive(j.notifications||[]);}
  catch(e){setLiveError(e instanceof Error?e.message:"Could not load admin notifications.");}
  finally{setLiveLoading(false);}
 },[]);
 useEffect(()=>{void loadLive();const t=window.setInterval(loadLive,15000);return()=>window.clearInterval(t)},[loadLive]);
 const refresh=async()=>{const r=await fetch("/api/admin/notification-templates");const j=await r.json();if(r.ok)setItems(j.templates||[]);else setNotice(j.error||"Could not load notification templates.");};
  useEffect(()=>{setItems(initialTemplates);if(refreshKey!==undefined){refresh();}},[initialTemplates,refreshKey]);
 const markRead=async(id:string)=>{await fetch("/api/admin/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id})});await loadLive();};
 const markAll=async()=>{setBusy(true);const response=await fetch("/api/admin/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({all:true})});if(response.ok){await loadLive();}setBusy(false);};
 const openLive=async(n:Notice)=>{if(!n.read_at)await markRead(n.id);const url=String(n.metadata?.action_url||"/admin");if(url.startsWith("/"))window.location.assign(url);};

 const save=async()=>{if(!editing)return;setBusy(true);setNotice("");const r=await fetch("/api/admin/notification-templates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(editing)});const j=await r.json();setNotice(r.ok?(editing.id?"Notification updated.":"Notification created."):j.error||"Save failed.");if(r.ok){await refresh();setEditing(null)}setBusy(false)};
 const remove=async(id:string)=>{if(!window.confirm("Delete this custom notification template? This cannot be undone."))return;setBusy(true);const r=await fetch("/api/admin/notification-templates",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id})});const j=await r.json();setNotice(r.ok?"Custom notification deleted.":j.error||"Delete failed.");if(r.ok)await refresh();setBusy(false)};
 const toggle=async(x:any)=>{setBusy(true);const r=await fetch("/api/admin/notification-templates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...x,enabled:!x.enabled})});const j=await r.json();setNotice(r.ok?(x.name+" "+(!x.enabled?"enabled":"disabled")+"."):(j.error||"Update failed."));if(r.ok)await refresh();setBusy(false)};
 const start=(x:any)=>setEditing({...x,variables:Array.isArray(x.variables)?x.variables:[]});

 return <section className="admin-section notification-center">
  <section className="notification-hero"><div><span className="muted">ADMIN OPERATIONS</span><h2>Notification command center</h2><p>Separate live operational alerts from message templates. Attention items tell you where the platform needs an administrator.</p></div><button className="notification-create" onClick={()=>setEditing({...blank})}><Plus size={15}/> New notification template</button></section>
  <section className="admin-card admin-live-notifications">
   <div className="admin-card-head"><div><span className="muted">LIVE ADMIN INBOX</span><h2>What is happening</h2><p>Important events are recorded here and can also reach the administrator's registered device through ZYNTH push notifications.</p></div><div className="admin-live-actions"><button onClick={markAll} disabled={busy||!live.some(x=>!x.read_at)}><CheckCheck size={13}/> Read all</button><button onClick={loadLive} disabled={liveLoading}><Clock3 size={13}/> {liveLoading?"Refreshing…":"Refresh"}</button></div></div>
   <div className="admin-live-filters"><Filter size={13}/>{(["attention","unread","all"] as const).map(f=><button key={f} className={liveFilter===f?"active":""} onClick={()=>setLiveFilter(f)}>{f==="attention"?"Needs attention":f==="unread"?"Unread":"All"}</button>)}</div>
   {liveError&&<div className="admin-notification-error">{liveError}</div>}
   {liveLoading?<div className="admin-live-loading">{[1,2,3].map(i=><div key={i} className="admin-live-skeleton"><i/><span/><b/></div>)}</div>:<div className="admin-live-list">
    {filteredLive.map(n=><button key={n.id} className={"admin-live-item "+(!n.read_at?"unread":"")} onClick={()=>openLive(n)}>
      <span className={"admin-live-icon "+String(n.type||"system")}>{noticeIcon(n)}</span>
      <span className="admin-live-copy"><span><b>{n.title}</b>{!n.read_at&&<i/>}</span><small>{n.body}</small><em><Clock3 size={10}/>{timeAgo(n.created_at)}{["attention","critical"].includes(String(n.metadata?.priority||"normal"))&&<strong>{n.metadata?.priority==="critical"?"Critical":"Needs attention"}</strong>}{Number(n.metadata?.dedupe_count||1)>1&&<strong className="admin-batch-count">×{Number(n.metadata?.dedupe_count)}</strong>}</em></span>
      <ChevronRight size={14}/>
    </button>)}
    {!filteredLive.length&&!liveError&&<div className="admin-empty"><CheckCircle2 size={22}/><p>{liveFilter==="attention"?"No items need attention.":liveFilter==="unread"?"No unread notifications.":"No admin activity yet."}</p></div>}
   </div>}
  </section>

  <section className="notification-hero notification-template-hero"><div><span className="muted">MESSAGE TEMPLATES</span><h2>Notification control</h2><p>Control the exact in-app message users receive when money moves, investments change, settlements complete, or account events occur.</p></div></section>
  {notice&&<div className="admin-notice">{notice}</div>}
  <section className="admin-card notification-toolbar"><div className="notification-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search events, titles or message copy…"/></div><div className="notification-cats">{cats.map(c=><button key={c} className={cat===c?"active":""} onClick={()=>setCat(c)}>{c}</button>)}</div></section>
  <section className="notification-grid">
   {filtered.map(x=><article className={"notification-template "+(!x.enabled?"disabled":"")} key={x.id}>
    <div className="notification-template-top"><span className={"notification-category "+x.category}>{x.category}</span><span className={"notification-status "+(x.enabled?"on":"off")}><i/>{x.enabled?"LIVE":"OFF"}</span></div>
    <div className="notification-event"><Bell size={14}/><code>{x.event_key}</code>{x.system_event&&<span title="System event"><ShieldCheck size={12}/></span>}</div>
    <h3>{x.name}</h3><p className="notification-description">{x.description||"Custom notification event."}</p>
    <div className="notification-preview"><strong>{x.title}</strong><span>{x.body}</span></div>
    <div className="notification-template-foot"><span>{(x.variables||[]).length} variable{(x.variables||[]).length===1?"":"s"}</span><div><button className="notification-icon-btn" onClick={()=>start(x)} title="Edit"><Edit3 size={13}/></button><button className="notification-icon-btn" onClick={()=>toggle(x)} disabled={busy} title={x.enabled?"Disable":"Enable"}><Power size={13}/></button>{!x.system_event&&<button className="notification-icon-btn danger" onClick={()=>remove(x.id)} disabled={busy} title="Delete"><Trash2 size={13}/></button>}</div></div>
   </article>)}
   {!filtered.length&&<div className="admin-empty notification-empty"><Bell size={22}/><p>No notification templates match this filter.</p></div>}
  </section>
  {editing&&<div className="notification-modal-backdrop"><section className="notification-modal" role="dialog" aria-modal="true">
   <header><div><span className="muted">{editing.id?"EDIT TEMPLATE":"CREATE TEMPLATE"}</span><h2>{editing.name||"New notification"}</h2><p>Changes apply to future events only. Existing notifications are never rewritten.</p></div><button className="icon-button" onClick={()=>setEditing(null)}><X size={16}/></button></header>
   <div className="notification-form-grid">
    <label><span>Event key <b>Required</b></span><input value={editing.event_key||""} disabled={!!editing.id&&editing.system_event} onChange={e=>setEditing({...editing,event_key:e.target.value})} placeholder="e.g. deposit.confirmed"/><small>Lowercase letters, numbers, dots, hyphens and underscores.</small></label>
    <label><span>Template name <b>Required</b></span><input value={editing.name||""} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="Deposit confirmed"/></label>
    <label><span>Category</span><select value={editing.category||"custom"} onChange={e=>setEditing({...editing,category:e.target.value})}>{cats.filter(x=>x!=="all").map(c=><option key={c}>{c}</option>)}</select></label>
    <label><span>Notification type</span><select value={editing.notification_type||"activity"} onChange={e=>setEditing({...editing,notification_type:e.target.value})}><option>activity</option><option>deposit</option><option>withdrawal</option><option>investment</option><option>performance</option><option>trader</option></select></label>
    <label className="wide"><span>Internal description</span><input value={editing.description||""} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="What triggers this message?"/></label>
    <label className="wide"><span>Notification title <b>Required</b></span><input value={editing.title||""} onChange={e=>setEditing({...editing,title:e.target.value})} placeholder="Deposit confirmed"/></label>
    <label className="wide"><span>Message body <b>Required</b></span><textarea value={editing.body||""} onChange={e=>setEditing({...editing,body:e.target.value})} rows={5} placeholder="Your {{amount}} deposit has been confirmed."/></label>
    <label className="wide"><span>Variables <small>comma separated</small></span><input value={(editing.variables||[]).join(", ")} onChange={e=>setEditing({...editing,variables:e.target.value.split(",").map((v:string)=>v.trim().replace(/^{{|}}$/g,"")).filter(Boolean)})} placeholder="amount, reference, strategy"/></label>
   </div>
   <div className="notification-live-preview"><div><span>LIVE PREVIEW</span><strong>{editing.title||"Notification title"}</strong><p>{(editing.body||"Your message will appear here.").replace(/{{(.*?)}}/g,(match:string,k:string)=>{const v=(editing.variables||[]).find((x:string)=>x===k.trim());return v?"["+v+"]":"{{"+k+"}}"})}</p></div><Eye size={18}/></div>
   <footer><div>{editing.system_event?<><ShieldCheck size={14}/> System event — cannot be deleted</>:<><Copy size={14}/> Custom event — fully removable</>}</div><div><button className="ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="notification-save" onClick={save} disabled={busy||!editing.name?.trim()||!editing.event_key?.trim()||!editing.title?.trim()||!editing.body?.trim()}>{busy?"Saving…":<><CheckCircle2 size={14}/> Save template</>}</button></div></footer>
  </section></div>}
 </section>;
}