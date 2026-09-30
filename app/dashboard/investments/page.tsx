"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowDownRight,ArrowUpRight,ChevronDown,Clock3,LockKeyhole,Plus,ShieldCheck,SlidersHorizontal,TrendingUp,WalletCards} from "lucide-react";
const money=(n:any)=>"₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
const dt=(v:any)=>v?new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}):"—";
export default function Investments(){
 const[strategies,setStrategies]=useState<any[]>([]),[positions,setPositions]=useState<any[]>([]),[redemptions,setRedemptions]=useState<any[]>([]),[cash,setCash]=useState(0),[amounts,setAmounts]=useState<Record<string,string>>({}),[topups,setTopups]=useState<Record<string,string>>({}),[exits,setExits]=useState<Record<string,string>>({}),[manageOpen,setManageOpen]=useState<Record<string,boolean>>({}),[strategyDetailsOpen,setStrategyDetailsOpen]=useState<Record<string,boolean>>({}),[busy,setBusy]=useState(""),[msg,setMsg]=useState(""),[funding,setFunding]=useState<any>(null),[paymentMethods,setPaymentMethods]=useState<any>(null),[paymentMethod,setPaymentMethod]=useState(""),[payCurrency,setPayCurrency]=useState("");
 async function load(){try{const[a,p,m]=await Promise.all([fetch("/api/account/summary").then(r=>r.json()),fetch("/api/strategies").then(r=>r.json()),fetch("/api/investments/mine").then(r=>r.json())]);setCash(Number(a.summary?.cash||0));setStrategies(p.strategies||[]);setPositions(m.investments||[]);setRedemptions(m.redemptions||[])}catch{}}
 useEffect(()=>{load()},[]);
 async function openFunding(kind:"new"|"topup",id:string){
  const amount=Number(kind==="new"?amounts[id]||0:topups[id]||0);
  const s=kind==="new"?strategies.find(x=>x.id===id):positions.find(x=>x.id===id)?.zynth_strategies;
  if(!Number.isFinite(amount)||amount<=0){setMsg(kind==="new"?"Enter a valid investment amount.":"Enter a valid top-up amount.");return}
  if(kind==="new"&&s?.minimum_investment&&amount<Number(s.minimum_investment)){setMsg("Minimum investment is "+money(s.minimum_investment)+".");return}
  if(kind==="new"&&s?.maximum_investment&&amount>Number(s.maximum_investment)){setMsg("Maximum investment is "+money(s.maximum_investment)+".");return}
  setBusy(kind+":"+id);setMsg("");
  try{
    const r=await fetch("/api/payments/methods",{cache:"no-store"});const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Unable to load payment methods.");
    const manual=d.manual||{}, crypto=d.crypto||{};
    const firstManual=manual.flutterwave?"flutterwave":manual.paystack?"paystack":"";
    const firstCrypto=crypto.enabled?(crypto.currencies?.[0]||""):"";
    if(!firstManual&&!firstCrypto)throw new Error("No funding payment method is currently available.");
    setPaymentMethods(d);setPaymentMethod(firstManual||"crypto");setPayCurrency(firstCrypto);setFunding({kind,id,amount});setBusy("");
  }catch(e:any){setMsg(e?.message||"Unable to load payment methods.");setBusy("");}
}
async function confirmFunding(){
  if(!funding)return;
  const {kind,id,amount}=funding;setBusy("funding");setMsg("");
  try{
    if(paymentMethod==="crypto"){
      const body=kind==="new"?{amount,strategyId:id,payCurrency}:{amount,investmentId:id,payCurrency};
      const r=await fetch("/api/payments/nowpayments/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to create crypto payment.");
      window.location.href="/dashboard/crypto-payment/"+d.payment.id;
      return;
    }
    const endpoint=kind==="new"?"/api/deposits/create":"/api/investments/topup/deposit";
    const body=kind==="new"?{amount,method:paymentMethod,strategyId:id}:{amount,method:paymentMethod,investmentId:id};
    const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to start funding.");
    window.location.href="/dashboard/deposit/"+d.request.id+"?returnTo="+encodeURIComponent("/dashboard/investments");
  }catch(e:any){setMsg(e?.message||"Unable to start funding.");setBusy("");}
}
async function topup(id:string){await openFunding("topup",id)}
async function invest(id:string){await openFunding("new",id)}

 async function exit(id:string){const amount=Number(exits[id]||0);if(!Number.isFinite(amount)||amount<=0){setMsg("Enter the amount you want to redeem.");return}setBusy("exit:"+id);setMsg("");const r=await fetch("/api/investments/redemptions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({investmentId:id,amount})});const d=await r.json();if(r.ok){setMsg("Redemption submitted. Your units are reserved at the confirmed NAV.");await load();setBusy("");return}setMsg(d.error||"Unable to request redemption.");setBusy("")}
 async function cancel(id:string){setBusy("cancel:"+id);const r=await fetch("/api/investments/redemptions/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({redemptionId:id})});const d=await r.json();setMsg(r.ok?"Redemption cancelled and the position restored.":(d.error||"Unable to cancel redemption."));await load();setBusy("")}
 return <section className="dashboard-content dashboard-spacing-page"><header className="dashboard-header premium-header"><div><div className="eyebrow-row"><span className="eyebrow">ZYNTH / INVESTMENTS</span><span className="live-dot"><i/> NAV ACCOUNTING</span></div><h1>Investments, with control.</h1><p>Top up existing positions, request exits, and see exactly when proceeds become available.</p></div><Link className="fund-btn secondary-dark" href="/dashboard"><ArrowUpRight size={15}/> Overview</Link></header>
 <div className="wealth-hero"><div className="wealth-main"><div className="wealth-label"><span>Available cash</span><span className="secure-chip"><ShieldCheck size={13}/> Ready</span></div><strong>{money(cash)}</strong><div className="wealth-breakdown"><span><i className="dot available"/> Available</span><span><i className="dot locked"/> Active positions {positions.length}</span></div></div><div className="wealth-side"><div><span>Active positions</span><b>{positions.filter(x=>x.status==="active").length}</b></div><div><span>Pending exits</span><b>{redemptions.filter(x=>["pending","approved","processing"].includes(x.status)).length}</b></div><div><span>Model</span><b>NAV + units</b></div></div></div>
 {msg&&<div className="notice">{msg}</div>}
 <section className="panel"><div className="panel-head"><div><span className="muted">YOUR PORTFOLIO</span><h2>Active strategy positions</h2></div></div><div className="dashboard-grid">{positions.filter(x=>x.status==="active").map(i=><article className="panel" key={i.id}><div className="panel-head"><div><span className="status-badge"><i/> ACTIVE</span><h2>{i.zynth_strategies?.name||"Strategy"}</h2></div><span className="secure-chip"><LockKeyhole size={12}/> Unit position</span></div><div className="vault-card-amount">{money(i.current_value)}</div><div className="health-grid"><div><span>Principal</span><b>{money(i.principal_remaining)}</b></div><div><span>Units</span><b>{Number(i.units).toFixed(6)}</b></div><div><span>Entry NAV</span><b>{Number(i.entry_nav).toFixed(4)}</b></div><div><span>Current NAV</span><b>{Number(i.zynth_strategies?.nav||0).toFixed(4)}</b></div></div><div className="manage-investment">
 <button type="button" className={"manage-investment-trigger"+(manageOpen[i.id]?" is-open":"")} aria-expanded={!!manageOpen[i.id]} aria-controls={"manage-investment-"+i.id} onClick={()=>setManageOpen({...manageOpen,[i.id]:!manageOpen[i.id]})}>
   <span className="manage-investment-trigger-copy"><SlidersHorizontal size={15}/><span><b>Manage investment</b><small>Actions for this position</small></span></span>
   <ChevronDown size={17} className="manage-investment-chevron"/>
 </button>
 <div id={"manage-investment-"+i.id} className={"manage-investment-panel"+(manageOpen[i.id]?" is-open":"")} aria-hidden={!manageOpen[i.id]}>
  <div className="investment-action-stack">
   <div className="investment-action-row"><div className="investment-action-label"><span>ADD CAPITAL</span><small>Increase this position</small></div><div className="investment-command"><div className="money-input investment-money-input"><span>₦</span><input inputMode="decimal" placeholder="0.00" value={topups[i.id]||""} onChange={e=>setTopups({...topups,[i.id]:e.target.value})}/></div><button className="investment-action-button primary" disabled={!manageOpen[i.id]||busy==="topup:"+i.id} onClick={()=>topup(i.id)}><Plus size={15}/> Top up</button></div></div>
   <div className="investment-action-row"><div className="investment-action-label"><span>EXIT POSITION</span><small>Request a redemption</small></div><div className="investment-command"><div className="money-input investment-money-input"><span>₦</span><input inputMode="decimal" placeholder="0.00" value={exits[i.id]||""} onChange={e=>setExits({...exits,[i.id]:e.target.value})}/></div><button className="investment-action-button ghost" disabled={!manageOpen[i.id]||busy==="exit:"+i.id} onClick={()=>exit(i.id)}><ArrowDownRight size={15}/> Request exit</button></div></div>
  </div>
 </div>
 </div><small>Exits use the latest confirmed NAV. Fees, approval and release timing are controlled by operations.</small></article>)}</div>{!positions.filter(x=>x.status==="active").length&&<div className="premium-empty"><TrendingUp size={21}/><h3>No active investments yet</h3><p>Choose a live strategy below to start building your portfolio.</p></div>}</section>
 <section className="panel"><div className="panel-head"><div><span className="muted">REDEMPTION ACTIVITY</span><h2>Exit timeline</h2></div></div><div className="activity-list">{redemptions.map(r=><div className="activity-row" key={r.id}><span className="activity-icon neutral">{r.status==="released"?<WalletCards size={16}/>:<Clock3 size={16}/>}</span><span className="activity-info"><b>{r.zynth_strategies?.name||"Strategy"} · {money(r.net_amount)} net</b><small>{r.status.toUpperCase()} · Requested {dt(r.requested_at)} · Release {dt(r.release_at)}</small></span><span>{r.status==="pending"&&<button className="text-action" disabled={busy==="cancel:"+r.id} onClick={()=>cancel(r.id)}>Cancel</button>}</span></div>)}{!redemptions.length&&<div className="activity-empty"><Clock3 size={18}/><span>No redemption requests yet.</span></div>}</div></section>
 <section className="panel">
  <div className="panel-head">
   <div><span className="muted">STRATEGY MARKET</span><h2>Explore live strategies</h2></div>
   <span className="secure-chip"><ShieldCheck size={12}/> Confirmed settlement</span>
  </div>
  <div className="dashboard-grid">
   {strategies.map(s=>(
    <section className="panel strategy-market-card" key={s.id}>
     <div className="panel-head">
      <div><span className="muted">ACTIVE STRATEGY</span><h2>{s.name}</h2></div>
      <span className="status-badge"><i/> LIVE</span>
     </div>
     <div className="health-grid strategy-market-metrics">
      <div><span>Current NAV</span><b>₦{Number(s.nav).toFixed(4)}</b></div>
      <div><span>Minimum</span><b>{money(s.minimum_investment)}</b></div>
     </div>
     <div className="strategy-details">
      <button type="button" className={"strategy-details-trigger"+(strategyDetailsOpen[s.id]?" is-open":"")} aria-expanded={!!strategyDetailsOpen[s.id]} aria-controls={"strategy-details-"+s.id} onClick={()=>setStrategyDetailsOpen({...strategyDetailsOpen,[s.id]:!strategyDetailsOpen[s.id]})}>
       <span className="strategy-details-trigger-copy">
        <SlidersHorizontal size={15}/>
        <span><b>View strategy details</b><small>Review the strategy, terms and start a position</small></span>
       </span>
       <ChevronDown size={17} className="strategy-details-chevron"/>
      </button>
      <div id={"strategy-details-"+s.id} className={"strategy-details-panel"+(strategyDetailsOpen[s.id]?" is-open":"")} aria-hidden={!strategyDetailsOpen[s.id]}>
       <div>
        <div className="strategy-details-body">
         <div className="strategy-details-description"><span>STRATEGY OVERVIEW</span><p>{s.description||"A ZYNTH-managed strategy with daily performance confirmed by operations."}</p></div>
         <div className="strategy-detail-term">
          <span>MAXIMUM INVESTMENT</span>
          <b>{s.maximum_investment?money(s.maximum_investment):"No cap"}</b>
         </div>
         <div className="investment-action-stack strategy-invest-action">
          <div className="investment-action-row">
           <div className="investment-action-label"><span>START POSITION</span><small>Choose an amount within the strategy limits</small></div>
           <div className="investment-command">
            <div className="money-input investment-money-input"><span>₦</span><input inputMode="decimal" placeholder="0.00" value={amounts[s.id]||""} onChange={e=>setAmounts({...amounts,[s.id]:e.target.value})}/></div>
            <button className="investment-action-button primary" disabled={busy==="invest:"+s.id} onClick={()=>invest(s.id)}><TrendingUp size={16}/> Invest in <span className="investment-action-name">{s.name}</span></button>
           </div>
          </div>
         </div>
        </div>
       </div>
      </div>
     </div>
    </section>
   ))}
  </div>
  {!strategies.length&&<div className="premium-empty"><TrendingUp size={21}/><h3>No strategies are open yet</h3><p>The operations team will publish strategies here when ready.</p></div>}
 </section>
 {funding&&<div className="funding-modal-backdrop" onMouseDown={()=>{if(busy!=="funding")setFunding(null)}}><section className="funding-modal" onMouseDown={e=>e.stopPropagation()}><div className="funding-modal-head"><div><span className="muted">SECURE FUNDING</span><h2>{funding.kind==="new"?"Start your investment":"Add capital to your investment"}</h2><p>{money(funding.amount)} will be applied to the selected position after payment confirmation.</p></div><button className="icon-button" onClick={()=>{if(busy!=="funding")setFunding(null)}}>×</button></div><div className="funding-method-list">{paymentMethods?.manual?.flutterwave&&<button className={"funding-method"+(paymentMethod==="flutterwave"?" selected":"")} onClick={()=>setPaymentMethod("flutterwave")}><b>Flutterwave / Bank transfer</b><span>Pay using the configured bank-transfer instructions.</span></button>}{paymentMethods?.manual?.paystack&&<button className={"funding-method"+(paymentMethod==="paystack"?" selected":"")} onClick={()=>setPaymentMethod("paystack")}><b>Paystack / Bank transfer</b><span>Pay using the configured Paystack instructions.</span></button>}{paymentMethods?.crypto?.enabled&&<button className={"funding-method"+(paymentMethod==="crypto"?" selected":"")} onClick={()=>{setPaymentMethod("crypto");setPayCurrency(paymentMethods.crypto.currencies?.[0]||"")}}><b>Crypto</b><span>Pay with an available cryptocurrency through NOWPayments.</span></button>}</div>{paymentMethod==="crypto"&&<label className="funding-select"><span>Crypto network</span><select value={payCurrency} onChange={e=>setPayCurrency(e.target.value)}>{(paymentMethods?.crypto?.currencies||[]).map((c:string)=><option key={c} value={c}>{c.toUpperCase()}</option>)}</select></label>}<div className="funding-modal-actions"><button className="ghost" disabled={busy==="funding"} onClick={()=>setFunding(null)}>Cancel</button><button className="primary" disabled={busy==="funding"||!paymentMethod||(paymentMethod==="crypto"&&!payCurrency)} onClick={confirmFunding}>{busy==="funding"?"Starting…":"Continue securely"}</button></div></section></div>}
 </section>
}
