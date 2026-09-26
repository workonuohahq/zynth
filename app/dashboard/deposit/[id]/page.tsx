"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Copy, ExternalLink, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";

type Settings = {
  global_min_deposit:number; deposits_enabled:boolean; deposit_page_title:string; deposit_page_subtitle:string; deposit_page_notice:string; deposit_instructions:string;
  flutterwave_enabled:boolean; flutterwave_title:string; flutterwave_account_name:string; flutterwave_account_number:string; flutterwave_bank_name:string; flutterwave_extra:string;
  paystack_enabled:boolean; paystack_title:string; paystack_account_name:string; paystack_account_number:string; paystack_bank_name:string; paystack_extra:string;
};
type DepositRequest = { id:string; amount:number; method:string; status:string; reference:string; payment_reference:string|null; user_note:string|null; admin_note:string|null; created_at:string; processed_at:string|null };

const money=(n:number)=>`₦${Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function DepositPaymentPage({params}:{params:{id:string}}){
  const [returnTo,setReturnTo]=useState("/dashboard/investments");
  useEffect(()=>{const raw=new URLSearchParams(window.location.search).get("returnTo")||"/dashboard/investments";setReturnTo(raw.startsWith("/dashboard/")?raw:"/dashboard/investments");},[]);
  const [request,setRequest]=useState<DepositRequest|null>(null);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [loading,setLoading]=useState(true);
  const [copied,setCopied]=useState("");
  const [error,setError]=useState("");

  async function load(){
    try{
      const r=await fetch(`/api/deposits/${params.id}`,{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Unable to load payment page.");
      setRequest(d.request);setSettings(d.settings);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load payment page.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();const t=setInterval(load,10000);return()=>clearInterval(t)},[params.id]);

  const methods=useMemo(()=>settings?[{
    key:"flutterwave",enabled:settings.flutterwave_enabled,title:settings.flutterwave_title,accountName:settings.flutterwave_account_name,accountNumber:settings.flutterwave_account_number,bankName:settings.flutterwave_bank_name,extra:settings.flutterwave_extra
  },{
    key:"paystack",enabled:settings.paystack_enabled,title:settings.paystack_title,accountName:settings.paystack_account_name,accountNumber:settings.paystack_account_number,bankName:settings.paystack_bank_name,extra:settings.paystack_extra
  }].filter(x=>x.enabled):[],[settings]);

  async function copy(value:string,label:string){
    await navigator.clipboard.writeText(value);setCopied(label);setTimeout(()=>setCopied(""),1500);
  }

  if(loading)return <main className="payment-shell"><div className="payment-loading">Loading secure payment page…</div></main>;
  if(error||!request||!settings)return <main className="payment-shell"><div className="payment-error"><b>{error||"Payment request unavailable."}</b><Link href={returnTo}>Return to investment</Link></div></main>;

  const confirmed=request.status==="confirmed";
  const rejected=request.status==="rejected";
  const cancelled=request.status==="cancelled";
  async function cancelRequest(){
    const requestId=request?.id;
    if(!requestId){setError("Payment request is unavailable.");return;}
    if(!confirm("Cancel this payment request? You can start a new request afterwards."))return;
    setError("");
    try{const r=await fetch("/api/deposits/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({depositId:requestId})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to cancel request.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Unable to cancel request.");}
  }

  return <main className="payment-shell">
    <style jsx global>{`
      .payment-shell{min-height:100vh;background:#f5f6f8;color:#111827;padding:36px 18px 64px}
      .payment-wrap{max-width:940px;margin:0 auto}
      .payment-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}
      .payment-brand{font-weight:800;letter-spacing:.16em;font-size:14px}
      .payment-back{display:inline-flex;align-items:center;gap:7px;color:#64748b;text-decoration:none;font-size:13px}
      .payment-card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;box-shadow:0 18px 60px rgba(15,23,42,.08);overflow:hidden}
      .payment-hero{padding:30px 30px 24px;border-bottom:1px solid #eef0f3}
      .payment-eyebrow{font-size:11px;letter-spacing:.16em;color:#64748b;font-weight:800}
      .payment-hero h1{font-size:32px;line-height:1.1;margin:8px 0 8px;letter-spacing:-.03em}
      .payment-hero p{max-width:650px;color:#64748b;margin:0;line-height:1.6}
      .payment-amount{margin-top:22px;padding:18px 20px;border-radius:16px;background:#101827;color:#fff;display:flex;justify-content:space-between;align-items:center}
      .payment-amount span{color:#aab4c4;font-size:12px}.payment-amount strong{font-size:25px}
      .payment-reference{margin-top:14px;padding:14px 15px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;gap:14px}.payment-reference-copy{min-width:0}.payment-reference-label{display:block;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.12em}.payment-reference-value{display:block;margin-top:5px;font:800 16px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:#0f172a}.payment-reference-help{display:block;margin-top:5px;color:#64748b;font-size:11px;line-height:1.4}.payment-reference .copy-btn{flex:0 0 auto;border:1px solid #dbe3ec;background:#fff;border-radius:9px;padding:8px 10px;margin:0;font-weight:700}
      .payment-body{padding:26px 30px}
      .payment-notice{display:flex;gap:10px;padding:14px 15px;border-radius:14px;background:#f7f9fc;border:1px solid #e7ebf0;color:#526074;font-size:13px;line-height:1.55}
      .payment-section-title{margin:25px 0 12px;font-size:12px;letter-spacing:.13em;color:#64748b;font-weight:800}
      .method-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .method{border:1px solid #e4e8ee;border-radius:18px;padding:19px;background:#fff}
      .method-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:17px}
      .method-brand{font-weight:800;font-size:17px}.method-tag{font-size:10px;font-weight:800;letter-spacing:.08em;padding:5px 8px;border-radius:999px;background:#f1f5f9;color:#475569}
      .detail{padding:11px 0;border-top:1px solid #eef0f3;display:flex;justify-content:space-between;gap:14px}.detail span{color:#64748b;font-size:12px}.detail b{font-size:13px;text-align:right}
      .copy-btn{border:0;background:transparent;color:#334155;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;margin-left:7px}
      .method-extra{color:#64748b;font-size:12px;line-height:1.5;margin-top:12px}
      .payment-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .step{padding:15px;border:1px solid #e8ebef;border-radius:14px}.step-num{font-size:10px;color:#94a3b8;font-weight:800}.step b{display:block;margin-top:7px;font-size:13px}.step span{display:block;color:#64748b;font-size:11px;line-height:1.45;margin-top:5px}
      .status-box{margin-top:22px;padding:17px;border-radius:16px;border:1px solid #e5e7eb;display:flex;align-items:center;gap:12px}.status-box b{display:block}.status-box span{font-size:12px;color:#64748b}
      .status-pending svg{color:#a16207}.status-confirmed svg{color:#15803d}.status-rejected svg{color:#b91c1c}
      .payment-actions{display:flex;gap:10px;margin-top:22px}.payment-action{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:12px 16px;text-decoration:none;font-weight:700;font-size:13px}.payment-primary{background:#111827;color:#fff}.payment-secondary{border:1px solid #e2e8f0;color:#334155;background:#fff}
      .payment-foot{margin-top:15px;color:#94a3b8;font-size:11px;text-align:center}
      .payment-loading,.payment-error{max-width:600px;margin:20vh auto;text-align:center;background:#fff;padding:35px;border:1px solid #e5e7eb;border-radius:20px}.payment-error a{display:block;margin-top:15px;color:#111827}
      @media(max-width:700px){.payment-hero,.payment-body{padding:22px 18px}.payment-hero h1{font-size:27px}.method-grid,.payment-steps{grid-template-columns:1fr}.payment-top{margin-bottom:18px}.payment-amount strong{font-size:21px}}
    `}</style>

    <div className="payment-wrap">
      <div className="payment-top"><span className="payment-brand">ZYNTH</span><Link href="/dashboard/transactions" className="payment-back"><ArrowLeft size={14}/> Back to activity</Link></div>
      <div className="payment-card">
        <section className="payment-hero">
          <div className="payment-eyebrow">SECURE PAYMENT</div>
          <h1>{settings.deposit_page_title}</h1>
          <p>{settings.deposit_page_subtitle}</p>
          <div className="payment-amount"><span>AMOUNT TO PAY</span><strong>{money(request.amount)}</strong></div>
          {request.payment_reference&&<div className="payment-reference"><div className="payment-reference-copy"><span className="payment-reference-label">PAYMENT REFERENCE</span><span className="payment-reference-value">{request.payment_reference}</span><span className="payment-reference-help">Copy this reference and paste it into your bank transfer description / narration.</span></div><button className="copy-btn" onClick={()=>copy(request.payment_reference!,"payment-reference")}><Copy size={13}/>{copied==="payment-reference"?"Copied":"Copy"}</button></div>}
        </section>
        <section className="payment-body">
          <div className="payment-notice"><ShieldCheck size={18}/><span>{settings.deposit_page_notice}</span></div>
          <div className="payment-section-title">PAYMENT OPTIONS</div>
          {methods.length?<div className="method-grid">{methods.map(m=><div className="method" key={m.key}>
            <div className="method-head"><span className="method-brand">{m.title}</span><span className="method-tag">AVAILABLE</span></div>
            {m.accountName&&<div className="detail"><span>Account name</span><b>{m.accountName}</b></div>}
            {m.accountNumber&&<div className="detail"><span>Account / wallet</span><b>{m.accountNumber}<button className="copy-btn" onClick={()=>copy(m.accountNumber,"account")}><Copy size={11}/>{copied==="account"?"Copied":"Copy"}</button></b></div>}
            {m.bankName&&<div className="detail"><span>Bank / channel</span><b>{m.bankName}</b></div>}
            {m.extra&&<p className="method-extra">{m.extra}</p>}
          </div>)}</div>:<div className="payment-notice"><WalletCards size={18}/><span>Payment instructions have not been configured yet. Please contact support before paying.</span></div>}
          <div className="payment-section-title">HOW TO COMPLETE IT</div>
          <p className="copy" style={{color:"#64748b",fontSize:13,lineHeight:1.6,whiteSpace:"pre-line"}}>{settings.deposit_instructions}</p>
          <div className="payment-steps">
            <div className="step"><span className="step-num">01</span><b>Pay the exact amount</b><span>Use one of the configured payment channels above.</span></div>
            <div className="step"><span className="step-num">02</span><b>Use your reference</b><span>Paste the payment reference above into your bank transfer description / narration.</span></div>
            <div className="step"><span className="step-num">03</span><b>Complete your payment</b><span>Once your payment is verified, your deposit is automatically invested into the selected strategy and your position becomes active.</span></div>
          </div>
          <div className={`status-box status-${request.status}`}>
            {confirmed?<CheckCircle2/>:rejected||cancelled?<ExternalLink/>:<Clock3/>}
            <div><b>{confirmed?"Investment activated":rejected?"Payment request unavailable":cancelled?"Payment request cancelled":"Payment request received"}</b><span>Request {request.reference} · {new Date(request.created_at).toLocaleString("en-NG")}</span>{request.admin_note&&<span>{request.admin_note}</span>}</div>
          </div>
          <div className="payment-actions">
            <Link className="payment-action payment-primary" href={returnTo}>{confirmed?"View investment":"Return to investment"} <ArrowRight size={15}/></Link>
            {request.status==="pending"&&<button className="payment-action payment-secondary" onClick={cancelRequest}>Cancel request</button>}
            <Link className="payment-action payment-secondary" href="/dashboard/transactions">View activity</Link>
          </div>
          <div className="payment-foot">Never share your password, OTP or authentication code with anyone claiming to be support.</div>
        </section>
      </div>
    </div>
  </main>
}