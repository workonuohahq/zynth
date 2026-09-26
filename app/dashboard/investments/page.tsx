"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,TrendingUp,ShieldCheck,WalletCards} from "lucide-react";
const money=(n:any)=>`₦${Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export default function Investments(){
 const [strategies,setStrategies]=useState<any[]>([]),[cash,setCash]=useState(0),[amounts,setAmounts]=useState<Record<string,string>>({}),[msg,setMsg]=useState("");
 useEffect(()=>{Promise.all([fetch("/api/account/summary").then(r=>r.json()),fetch("/api/strategies").then(r=>r.json())]).then(([s,p])=>{setCash(Number(s.summary?.cash||0));setStrategies(p.strategies||[])}).catch(()=>{});},[]);
 useEffect(()=>{const q=new URLSearchParams(window.location.search);const strategyId=q.get("strategyId"),amount=q.get("amount");if(strategyId&&amount&&Number(amount)>0)setAmounts(v=>({...v,[strategyId]:amount}));},[]);
 async function invest(id:string){
 const amount=Number(amounts[id]||0);
 if(!Number.isFinite(amount)||amount<=0){setMsg("Enter a valid investment amount.");return;}
 const strategy=strategies.find(s=>s.id===id);
 if(strategy?.minimum_investment&&amount<Number(strategy.minimum_investment)){setMsg(`Minimum investment is ${money(strategy.minimum_investment)}.`);return;}
 if(strategy?.maximum_investment&&amount>Number(strategy.maximum_investment)){setMsg(`Maximum investment is ${money(strategy.maximum_investment)}.`);return;}
 setMsg("");
 const r=await fetch("/api/investments/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({strategyId:id,amount})});
 const d=await r.json();
 if(r.ok){setMsg("Investment created successfully.");setCash(cash-amount);setAmounts({...amounts,[id]:""});return;}
 if(d.code==="INSUFFICIENT_AVAILABLE_BALANCE"||/INSUFFICIENT_AVAILABLE_BALANCE/i.test(String(d.error||""))){
   const dep=await fetch("/api/deposits/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount,method:"manual",strategyId:id})});
   const dd=await dep.json();
   if(!dep.ok){
     if(dd.code==="PENDING_DEPOSIT_EXISTS"){setMsg("You already have a pending deposit. Open Activity to continue that payment before investing.");}
     else if(dd.code==="BELOW_MINIMUM"){setMsg("The investment amount is below the platform deposit minimum. Increase the investment amount or fund your wallet separately first.");}
     else setMsg(dd.error||"Unable to start the funding request.");
     return;
   }
   const requestId=dd.request?.id;
   if(!requestId){setMsg("Funding request created, but the payment page could not be opened.");return;}
   window.location.href=`/dashboard/deposit/${requestId}?returnTo=${encodeURIComponent("/dashboard/investments?strategyId="+id+"&amount="+amount)}`;
   return;
 }
 setMsg(d.error||"Unable to invest.");
}
 return <section className="dashboard-content"><header className="dashboard-header"><div><span className="eyebrow">ZYNTH / INVESTMENTS</span><h1>Choose a strategy.</h1><p>Own units in a strategy and let confirmed daily performance determine your position value.</p></div><Link className="fund-btn secondary-dark" href="/dashboard">Overview <ArrowUpRight size={15}/></Link></header>
 <div className="wealth-hero"><div className="wealth-main"><div className="wealth-label"><span>Available cash</span><span className="secure-chip"><ShieldCheck size={13}/> Settlement based</span></div><strong>{money(cash)}</strong><div className="wealth-breakdown"><span><i className="dot available"/> Cash available for investment</span></div></div><div className="wealth-side"><div><span>Live strategies</span><b>{strategies.length}</b></div><div><span>Model</span><b>NAV + units</b></div><div><span>Settlement</span><b>Daily</b></div></div></div>
 {msg&&<div className="notice">{msg}</div>}
 <div className="dashboard-grid">{strategies.map(s=><section className="panel" key={s.id}><div className="panel-head"><div><span className="muted">ACTIVE STRATEGY</span><h2>{s.name}</h2></div><span className="status-badge"><i/> LIVE</span></div><p className="copy">{s.description||"A ZYNTH-managed strategy with daily performance confirmed by operations."}</p><div className="health-grid"><div><span>Current NAV</span><b>₦{Number(s.nav).toFixed(2)}</b></div><div><span>Minimum</span><b>{money(s.minimum_investment)}</b></div><div><span>Trader</span><b>{s.trader_name||"Assigned"}</b></div></div><div className="money-input" style={{marginTop:18}}><span>₦</span><input inputMode="decimal" placeholder="Investment amount" value={amounts[s.id]||""} onChange={e=>setAmounts({...amounts,[s.id]:e.target.value})}/></div><button className="primary full-button" onClick={()=>invest(s.id)}>Invest in {s.name} <ArrowUpRight size={16}/></button></section>)}{!strategies.length&&<section className="panel premium-empty"><div className="empty-icon"><TrendingUp size={21}/></div><h3>No strategies are open yet</h3><p>The ZYNTH operations team will publish strategies here when they are ready for investment.</p></section>}</div></section>;
}