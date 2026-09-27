"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Bell,CheckCheck,ChevronRight,Clock3,ShieldAlert,WalletCards,TrendingUp,Headphones} from "lucide-react";
type AdminNotification={id:string;title:string;body:string;type:string;read_at:string|null;created_at:string;metadata?:Record<string,any>};
function iconFor(n:AdminNotification){const type=String(n.type||"");if(type==="money")return <WalletCards size={14}/>;if(type==="investment"||type==="trader")return <TrendingUp size={14}/>;if(type==="support")return <Headphones size={14}/>;if(type==="security")return <ShieldAlert size={14}/>;return <Bell size={14}/>;}
function timeAgo(value:string){const ms=Date.now()-new Date(value).getTime(),m=Math.max(0,Math.floor(ms/60000));if(m<1)return "Just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";}
export default function AdminNotificationBell(){
 const [items,setItems]=useState<AdminNotification[]>([]),[unread,setUnread]=useState(0),[attention,setAttention]=useState(0),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);const ref=useRef<HTMLDivElement>(null);
 const load=useCallback(async()=>{try{const r=await fetch("/api/admin/notifications?limit=12",{cache:"no-store"});if(!r.ok)return;const j=await r.json();setItems(j.notifications||[]);setUnread(Number(j.unread_count||0));setAttention(Number(j.attention_count||0));}catch{}},[]);
 useEffect(()=>{void load();const t=window.setInterval(load,15000);return()=>window.clearInterval(t)},[load]);
 useEffect(()=>{const onDown=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener("mousedown",onDown);return()=>document.removeEventListener("mousedown",onDown)},[]);
 const markRead=async(id:string)=>{setBusy(true);try{await fetch("/api/admin/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id})});}finally{setBusy(false);await load();}};
 const markAll=async()=>{setBusy(true);try{await fetch("/api/admin/notifications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({all:true})});}finally{setBusy(false);await load();}};
 const openItem=async(n:AdminNotification)=>{if(!n.read_at)await markRead(n.id);const url=String(n.metadata?.action_url||"/admin");setOpen(false);if(url.startsWith("/"))window.location.assign(url);};
 return <div className="admin-notification-wrap" ref={ref}>
  <button className={"admin-notification-trigger "+(open?"open":"")} type="button" onClick={()=>setOpen(v=>!v)} aria-label={unread?"Notifications, "+unread+" unread":"Notifications"} aria-expanded={open}><Bell size={16}/>{unread>0&&<span className="admin-notification-badge">{unread>99?"99+":unread}</span>}</button>
  {open&&<div className="admin-notification-popover" role="dialog" aria-label="Admin notifications">
   <header><div><span className="muted">ADMIN INBOX</span><h3>Notifications</h3><p>{attention>0?attention+" need attention":"No urgent items"}</p></div><button type="button" onClick={markAll} disabled={busy||unread===0}><CheckCheck size={14}/> Read all</button></header>
   <div className="admin-notification-list">
    {!items.length&&<div className="admin-notification-empty"><Bell size={20}/><b>You're all caught up</b><span>Important admin activity will appear here.</span></div>}
    {items.map(n=><button key={n.id} type="button" className={"admin-notification-item "+(!n.read_at?"unread":"")} onClick={()=>openItem(n)}>
     <span className={"admin-notification-type "+String(n.type||"system")}>{iconFor(n)}</span>
     <span className="admin-notification-content"><span className="admin-notification-line"><b>{n.title}</b>{!n.read_at&&<i/>}</span><small>{n.body}</small><em><Clock3 size={10}/>{timeAgo(n.created_at)}{["attention","critical"].includes(String(n.metadata?.priority||"normal"))&&<strong>Needs attention</strong>}</em></span><ChevronRight size={13} className="admin-notification-chevron"/>
    </button>)}
   </div>
   <footer><button type="button" onClick={()=>{setOpen(false);window.dispatchEvent(new CustomEvent("zynth-admin-open-notifications"))}}>Open notification center <ChevronRight size={12}/></button></footer>
  </div>}
 </div>;
}
