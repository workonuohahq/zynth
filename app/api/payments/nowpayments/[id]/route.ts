import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createClient} from "@supabase/supabase-js";
import {decryptProviderSecret} from "@/lib/secure-provider-secrets";
import {normalizeNowStatus,nowRequest} from "@/lib/nowpayments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req:Request,{params}:{params:{id:string}}){
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

  const key=String(params.id||"").trim();
  if(!key)return NextResponse.json({error:"Crypto payment reference is required."},{status:400});

  let {data,error}=await client
    .from("zynth_crypto_payments")
    .select("id,deposit_id,nowpayments_payment_id,price_amount,price_currency,pay_amount,pay_currency,pay_address,payment_status,actually_paid,actually_paid_currency,transaction_hash,expiration_at,credited_at,created_at,updated_at,last_ipn_at,deposit_requests!inner(id,amount,total_amount,fee_amount,status,reference)")
    .eq("id",key)
    .eq("user_id",user.id)
    .maybeSingle();

  if(!data&&!error){
    const result=await client
      .from("zynth_crypto_payments")
      .select("id,deposit_id,nowpayments_payment_id,price_amount,price_currency,pay_amount,pay_currency,pay_address,payment_status,actually_paid,actually_paid_currency,transaction_hash,expiration_at,credited_at,created_at,updated_at,last_ipn_at,deposit_requests!inner(id,amount,total_amount,fee_amount,status,reference)")
      .eq("deposit_id",key)
      .eq("user_id",user.id)
      .maybeSingle();
    data=result.data;
    error=result.error;
  }

  if(error||!data)return NextResponse.json({error:"Crypto payment not found."},{status:404});

  // The browser may poll this endpoint while the customer is paying.
  // Reconcile directly with NOWPayments when the local status is non-terminal
  // and the last callback is stale/missing. Secrets stay server-side.
  if(
    data.nowpayments_payment_id &&
    !["finished","failed","expired","refunded"].includes(String(data.payment_status||"").toLowerCase())
  ){
    try{
      const {data:settings}=await client.rpc("get_nowpayments_runtime_config");
      if(settings?.enabled && settings.last_test_status==="success" && settings.api_key_ciphertext){
        const apiKey=decryptProviderSecret(settings.api_key_ciphertext);
        const stale=!data.last_ipn_at || (Date.now()-new Date(data.last_ipn_at).getTime()>30000);
        if(stale){
          const provider=await nowRequest("/payment/"+encodeURIComponent(String(data.nowpayments_payment_id)),apiKey);
          const providerStatus=normalizeNowStatus(provider?.payment_status);
          if(providerStatus && providerStatus!=="unknown" && providerStatus!==String(data.payment_status||"").toLowerCase()){
            const actuallyPaid=provider?.actually_paid==null?null:Number(provider.actually_paid);
            let providerFee:number|null=null;
            if(provider?.fee){
              providerFee=Number(provider.fee?.serviceFee||0)+Number(provider.fee?.depositFee||0)+Number(provider.fee?.withdrawalFee||0);
            }
            await createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL||"https://pcmzoxtvkhzogxvumvzs.supabase.co",
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_Cgn1GCZxNxCQBGbdXYQc5A_olJfPkc5A",
              {auth:{autoRefreshToken:false,persistSession:false},global:{headers:{"x-zynth-runtime-secret":process.env.ZYNTH_RUNTIME_RPC_SECRET||process.env.ZYNTH_NOWPAYMENTS_RECONCILE_SECRET||""}}}
            ).rpc("process_nowpayments_ipn",{
              p_payment_id:String(data.nowpayments_payment_id),
              p_order_id:String(data.deposit_id),
              p_status:providerStatus,
              p_pay_currency:String(provider?.pay_currency||data.pay_currency||"").toLowerCase(),
              p_actually_paid:actuallyPaid,
              p_provider_fee:providerFee,
              p_transaction_hash:provider?.payin_hash||provider?.transaction_hash||provider?.hash||null,
              p_payload:provider
            });
          }
        }
      }
    }catch(e){
      // Never break the payment screen because reconciliation is temporarily unavailable.
      console.error("NOWPAYMENTS_POLL_RECONCILE_ERROR",e);
    }
  }

  // Re-read after any successful reconciliation so the UI immediately reflects
  // the authoritative provider status.
  const refreshed=await client
    .from("zynth_crypto_payments")
    .select("id,deposit_id,nowpayments_payment_id,price_amount,price_currency,pay_amount,pay_currency,pay_address,payment_status,actually_paid,actually_paid_currency,transaction_hash,expiration_at,credited_at,created_at,updated_at,last_ipn_at,deposit_requests!inner(id,amount,total_amount,fee_amount,status,reference)")
    .eq("id",data.id)
    .eq("user_id",user.id)
    .maybeSingle();

  return NextResponse.json({payment:refreshed.data||data});
}
