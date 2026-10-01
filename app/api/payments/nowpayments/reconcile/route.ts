import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {decryptProviderSecret} from "@/lib/secure-provider-secrets";
import {normalizeNowStatus,nowRequest} from "@/lib/nowpayments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cronAuthorized(req:Request){
  const expected=String(process.env.ZYNTH_NOWPAYMENTS_RECONCILE_SECRET||"").trim();
  if(!expected) return false;
  const supplied=req.headers.get("x-zynth-reconcile-secret")||req.headers.get("authorization")?.replace(/^Bearer\\s+/i,"")||"";
  return supplied===expected;
}

export async function POST(req:Request){
  if(!cronAuthorized(req)) return NextResponse.json({error:"Unauthorized."},{status:401});

  try{
    const supabase=createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL||"https://pcmzoxtvkhzogxvumvzs.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_Cgn1GCZxNxCQBGbdXYQc5A_olJfPkc5A",
      {auth:{autoRefreshToken:false,persistSession:false},global:{headers:{"x-zynth-runtime-secret":process.env.ZYNTH_NOWPAYMENTS_RECONCILE_SECRET||""}}}
    );

    const {data:settings,error:settingsError}=await supabase.rpc("get_nowpayments_runtime_config");
    if(settingsError||!settings?.enabled||settings.last_test_status!=="success"||!settings.api_key_ciphertext){
      return NextResponse.json({ok:false,error:"NOWPayments configuration unavailable."},{status:503});
    }

    const apiKey=decryptProviderSecret(settings.api_key_ciphertext);
    const {data:payments,error:listError}=await supabase.rpc("get_nowpayments_reconciliation_candidates",{p_limit:50});
    if(listError) throw listError;

    const summary={checked:0,changed:0,failed_provider_reads:0,processing_errors:0,results:[] as any[]};

    for(const cp of payments||[]){
      summary.checked++;
      try{
        const provider=await nowRequest("/payment/"+encodeURIComponent(String(cp.nowpayments_payment_id)),apiKey);
        const providerStatus=normalizeNowStatus(provider?.payment_status);
        if(!providerStatus || providerStatus==="unknown") continue;

        if(providerStatus===String(cp.payment_status||"").toLowerCase()){
          continue;
        }

        const actuallyPaid=provider?.actually_paid==null?null:Number(provider.actually_paid);
        let providerFee:number|null=null;
        if(provider?.fee){
          providerFee=Number(provider.fee?.serviceFee||0)+Number(provider.fee?.depositFee||0)+Number(provider.fee?.withdrawalFee||0);
        }

        const {data:processed,error:processError}=await supabase.rpc("process_nowpayments_ipn",{
          p_payment_id:String(cp.nowpayments_payment_id),
          p_order_id:String(cp.order_id),
          p_status:providerStatus,
          p_pay_currency:String(provider?.pay_currency||cp.pay_currency||"").toLowerCase(),
          p_actually_paid:actuallyPaid,
          p_provider_fee:providerFee,
          p_transaction_hash:provider?.payin_hash||provider?.transaction_hash||provider?.hash||null,
          p_payload:provider
        });

        if(processError) throw processError;

        summary.changed++;
        summary.results.push({
          payment_id:String(cp.nowpayments_payment_id),
          from:cp.payment_status,
          to:providerStatus,
          processed
        });
      }catch(e:any){
        if(String(e?.message||"").includes("NOWPayments request failed")) summary.failed_provider_reads++;
        else summary.processing_errors++;
        summary.results.push({
          payment_id:String(cp.nowpayments_payment_id),
          error:e?.message||"reconciliation failed"
        });
      }
    }

    return NextResponse.json({ok:true,...summary});
  }catch(e:any){
    console.error("NOWPAYMENTS_RECONCILE_ERROR",e);
    return NextResponse.json({ok:false,error:"NOWPayments reconciliation failed."},{status:500});
  }
}
