"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CheckCircle2,Clock3,Copy,LockKeyhole,ShieldCheck,XCircle} from "lucide-react";

const money=(n:any)=>"₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
const label=(c:string)=>({usdttrc20:"USDT · TRON (TRC20)",usdtbsc:"USDT · BNB Smart Chain",usdterc20:"USDT · Ethereum (ERC20)",usdtsol:"USDT · Solana",usdtmatic:"USDT · Polygon",usdc:"USDC",usdcspl:"USDC · Solana",usdcmatic:"USDC · Polygon"} as any)[c]||String(c||"").toUpperCase();

export default function CryptoPaymentPage({params}:{params:{id:string}}){
 const[p,setP]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[copied,setCopied]=useState(false);
 async function load(){try{const r=await fetch("/api/payments/nowpayments/"+params.id,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to load payment.");setP(d.payment)}catch(e:any){setError(e?.message||"Unable to load payment.")}finally{setLoading(false)}}
 useEffect(()=>{load();const t=setInterval(load,7000);return()=>clearInterval(t)},[params.id]);
 async function copy(){if(!p?.pay_address)return;await navigator.clipboard.writeText(p.pay_address);setCopied(true);setTimeout(()=>setCopied(false),1600)}
 if(loading)return <main style={{minHeight:"100vh",background:"#070706",color:"#f4efe7",padding:16}}><div style={{maxWidth:620,margin:"18vh auto",textAlign:"center",fontSize:13}}>Loading secure crypto checkout…</div></main>;
 if(error||!p)return <main style={{minHeight:"100vh",background:"#070706",color:"#f4efe7",padding:16}}><div style={{maxWidth:620,margin:"18vh auto",textAlign:"center"}}><b>{error||"Payment unavailable."}</b><Link href="/dashboard/investments" style={{display:"block",marginTop:14,color:"#d6c59f",fontSize:12}}>Return to investments</Link></div></main>;
 const done=p.payment_status==="finished"&&p.credited_at,terminal=["failed","expired","refunded"].includes(p.payment_status);
 return <main style={{minHeight:"100vh",background:"#070706",color:"#f4efe7",padding:"18px 14px 40px"}}>
  <div style={{maxWidth:640,margin:"0 auto"}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
    <Link href="/dashboard/investments" style={{color:"#aaa094",textDecoration:"none",fontSize:11,display:"flex",gap:6,alignItems:"center"}}><ArrowLeft size={13}/> Back</Link>
    <b style={{fontSize:13,letterSpacing:".08em"}}>ZYNTH</b>
   </div>
   <section style={{border:"1px solid #302b24",background:"#11100e",borderRadius:17,overflow:"hidden"}}>
    <header style={{padding:"18px 18px 15px",borderBottom:"1px solid #2b2721"}}>
     <span style={{fontSize:8,letterSpacing:".15em",color:"#9c8e7c",fontWeight:900}}>CRYPTO FUNDING</span>
     <h1 style={{fontSize:22,lineHeight:1.15,margin:"7px 0 5px",letterSpacing:"-.02em"}}>Complete crypto payment</h1>
     <p style={{color:"#928a80",fontSize:11,lineHeight:1.45,margin:0}}>Your investment stays pending until the payment is verified.</p>
    </header>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",borderBottom:"1px solid #2b2721"}}>
     <div style={{padding:"12px 14px",borderRight:"1px solid #2b2721"}}><small style={{fontSize:8,color:"#777067",letterSpacing:".08em"}}>INVESTMENT</small><b style={{display:"block",marginTop:4,fontSize:12}}>{money(p.deposit_requests?.amount)}</b></div>
     <div style={{padding:"12px 14px",borderRight:"1px solid #2b2721"}}><small style={{fontSize:8,color:"#777067",letterSpacing:".08em"}}>SEND</small><b style={{display:"block",marginTop:4,fontSize:12,wordBreak:"break-word"}}>{p.pay_amount||"—"} {String(p.pay_currency).toUpperCase()}</b></div>
     <div style={{padding:"12px 14px"}}><small style={{fontSize:8,color:"#777067",letterSpacing:".08em"}}>NETWORK</small><b style={{display:"block",marginTop:4,fontSize:11,lineHeight:1.25}}>{label(p.pay_currency)}</b></div>
    </div>
    <div style={{padding:16}}>
     <div style={{display:"flex",gap:9,alignItems:"center",padding:"10px 12px",border:"1px solid #302b24",background:"#0d0c0b",borderRadius:10}}>
      <span style={{width:7,height:7,flex:"0 0 auto",borderRadius:99,background:done?"#8fbd80":terminal?"#9d7168":"#b58b3b"}}/>
      <div style={{minWidth:0}}><b style={{fontSize:11}}>{done?"Deposit confirmed and investment activated":terminal?"Payment cannot be credited":"Waiting for payment / confirmation"}</b><small style={{display:"block",marginTop:2,color:"#797269",fontSize:9}}>Provider status: {String(p.payment_status).toUpperCase()}</small></div>
     </div>
     <div style={{marginTop:9,padding:12,border:"1px solid #302b24",borderRadius:10}}>
      <small style={{fontSize:8,color:"#777067",letterSpacing:".08em"}}>PAYMENT ADDRESS</small>
      <code style={{display:"block",margin:"7px 0 9px",wordBreak:"break-all",color:"#ead9b3",fontSize:11,lineHeight:1.45}}>{p.pay_address}</code>
      <button onClick={copy} style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #493d2e",background:"#1a160f",color:"#eee1c3",borderRadius:7,padding:"8px 10px",fontSize:9,fontWeight:800,cursor:"pointer"}}><Copy size={13}/>{copied?"Copied":"Copy address"}</button>
     </div>
     <div style={{display:"flex",gap:7,alignItems:"flex-start",marginTop:9,padding:"9px 10px",border:"1px solid #493a24",background:"#17130d",color:"#b6a88e",borderRadius:9,fontSize:9,lineHeight:1.4}}><ShieldCheck size={13} style={{flex:"0 0 auto",marginTop:1}}/> Send only the selected asset on the exact network shown above.</div>
     <div style={{display:"flex",flexWrap:"wrap",gap:"7px 14px",marginTop:11,color:"#706960",fontSize:9}}>
      <span style={{display:"flex",gap:5,alignItems:"center"}}><LockKeyhole size={11}/> ZYNTH reference <b style={{color:"#aaa095"}}>{p.deposit_requests?.reference}</b></span>
      {done?<span style={{display:"flex",gap:5,alignItems:"center"}}><CheckCircle2 size={11}/> Investment activated</span>:terminal?<span style={{display:"flex",gap:5,alignItems:"center"}}><XCircle size={11}/> No funds were credited</span>:<span style={{display:"flex",gap:5,alignItems:"center"}}><Clock3 size={11}/> Updates automatically</span>}
     </div>
    </div>
   </section>
  </div>
 </main>;
}