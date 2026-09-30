import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {decryptProviderSecret} from "@/lib/secure-provider-secrets";
import {normalizeNowStatus,verifyNowPaymentsSignature} from "@/lib/nowpayments";

const supabase=createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL||"https://pcmzoxtvkhzogxvumvzs.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_Cgn1GCZxNxCQBGbdXYQc5A_olJfPkcF",
  {auth:{autoRefreshToken:false,persistSession:false}}
);

export async function POST(req:Request){
  try{
    const raw=await req.text();
    const payload=JSON.parse(raw);
    const signature=req.headers.get("x-nowpayments-sig")||"";
    const {data:settings,error:settingsError}=await supabase.rpc("get_nowpayments_runtime_config");
    if(settingsError||!settings?.ipn_secret_ciphertext){
      return NextResponse.json({error:"Webhook configuration unavailable."},{status:503});
    }

    let secret:string;
    try{secret=decryptProviderSecret(settings.ipn_secret_ciphertext);}
    catch{return NextResponse.json({error:"Webhook configuration is invalid."},{status:503});}

    if(!verifyNowPaymentsSignature(payload,signature,secret)){
      return NextResponse.json({error:"Invalid signature."},{status:401});
    }

    const paymentId=String(payload?.payment_id||"");
    const orderId=String(payload?.order_id||"");
    if(!paymentId||!orderId)return NextResponse.json({error:"Missing payment identifiers."},{status:400});

    const status=normalizeNowStatus(payload.payment_status);
    const payCurrency=String(payload.pay_currency||"").toLowerCase();
    const actuallyPaid=payload.actually_paid==null?null:Number(payload.actually_paid);
    let providerFee:number|null=null;
    if(payload?.fee){
      providerFee=Number(payload.fee?.serviceFee||0)+Number(payload.fee?.depositFee||0)+Number(payload.fee?.withdrawalFee||0);
    }

    const {data:result,error}=await supabase.rpc("process_nowpayments_ipn",{
      p_payment_id:paymentId,
      p_order_id:orderId,
      p_status:status,
      p_pay_currency:payCurrency,
      p_actually_paid:actuallyPaid,
      p_provider_fee:providerFee,
      p_transaction_hash:payload?.payin_hash||payload?.transaction_hash||payload?.hash||null,
      p_payload:payload
    });

    if(error){
      const known:any={
        PAYMENT_NOT_RECOGNIZED:404,
        PAYMENT_ORDER_MISMATCH:409,
        PAYMENT_CURRENCY_MISMATCH:409,
        UNAUTHORIZED:401
      };
      const statusCode=known[error.message]||500;
      return NextResponse.json({error:statusCode===404?"Payment not recognized.":statusCode===409?"Payment/order mismatch.":"Webhook processing failed."},{status:statusCode});
    }

    return NextResponse.json(result||{ok:true});
  }catch(e:any){
    console.error("NOWPAYMENTS_IPN_ERROR",e);
    return NextResponse.json({error:"Webhook processing failed."},{status:500});
  }
}
