import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {decryptProviderSecret} from "@/lib/secure-provider-secrets";
import {extractMerchantCurrencies,getLiveUsdNgnRate,getNowPaymentsMinAmount,nowRequest} from "@/lib/nowpayments";

async function getServerNowPaymentsConfig(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const runtimeSecret=process.env.ZYNTH_NOWPAYMENTS_RECONCILE_SECRET?.trim();
  if(!url||!key||!runtimeSecret) throw new Error("NOWPayments server configuration is incomplete.");

  const supabase=createClient(url,key,{
    auth:{autoRefreshToken:false,persistSession:false},
    global:{headers:{"x-zynth-runtime-secret":runtimeSecret}}
  });
  const {data,error}=await supabase.rpc("get_nowpayments_server_config");
  if(error||!data) throw new Error(error?.message||"Crypto payment configuration is unavailable.");
  return data;
}

export async function POST(req:Request){
  try{
    const client=await createSupabaseServerClient();
    const {data:{user}}=await client.auth.getUser();
    if(!user) return NextResponse.json({error:"Authentication required."},{status:401});

    const b=await req.json().catch(()=>({}));
    const amount=Number(b?.amount);
    const strategyId=b?.strategyId?String(b.strategyId):"";
    const investmentId=b?.investmentId?String(b.investmentId):"";
    const payCurrency=String(b?.payCurrency||"").toLowerCase().trim();

    if(!Number.isFinite(amount)||amount<=0) return NextResponse.json({error:"Enter a valid investment amount."},{status:400});
    if((!strategyId&&!investmentId)||(strategyId&&investmentId)) return NextResponse.json({error:"Choose exactly one investment funding target."},{status:400});
    if(!payCurrency) return NextResponse.json({error:"Choose a cryptocurrency and network."},{status:400});

    let settings:any;
    try{ settings=await getServerNowPaymentsConfig(); }
    catch(e:any){ console.error("[ZYNTH_NOWPAYMENTS_CONFIG_FAILED]",String(e?.message||e).slice(0,500)); return NextResponse.json({error:"Crypto payment configuration is unavailable."},{status:503}); }

    if(!settings.enabled||settings.last_test_status!=="success") return NextResponse.json({error:"Crypto payments are temporarily unavailable."},{status:503});
    if(!settings.api_key_ciphertext) return NextResponse.json({error:"Crypto payment configuration is incomplete."},{status:503});

    const pricingCurrency="usd";
    if(payCurrency==="ngn") return NextResponse.json({error:"NGN is the ZYNTH accounting currency, not a crypto payment option. Please choose a supported cryptocurrency/network."},{status:400});

    let fx:{rate:number,source:string,capturedAt:string};
    try{ fx=await getLiveUsdNgnRate(); }
    catch(e:any){ console.error("[ZYNTH_NOWPAYMENTS_FX_FAILED]",String(e?.message||e).slice(0,500)); return NextResponse.json({error:"Live FX pricing is temporarily unavailable. Please try again shortly."},{status:503}); }
    const usdNgnRate=fx.rate;

    let apiKey:string;
    try{ apiKey=decryptProviderSecret(settings.api_key_ciphertext); }
    catch(e:any){ console.error("[ZYNTH_NOWPAYMENTS_KEY_DECRYPT_FAILED]",String(e?.message||e).slice(0,500)); return NextResponse.json({error:"Crypto payment configuration is invalid. Please contact support."},{status:503}); }
    if(!apiKey) return NextResponse.json({error:"Crypto payment configuration is incomplete."},{status:503});

    const {data:catalogEntry,error:catalogError}=await client
      .from("zynth_payment_currencies")
      .select("currency_code,provider_available,zynth_enabled")
      .eq("provider","nowpayments")
      .eq("currency_code",payCurrency)
      .maybeSingle();

    if(catalogError) return NextResponse.json({error:"Crypto asset configuration is temporarily unavailable."},{status:503});
    if(!catalogEntry?.provider_available||!catalogEntry?.zynth_enabled) return NextResponse.json({error:"That cryptocurrency/network is not currently available for ZYNTH crypto funding."},{status:400});

    let merchantCurrencies:string[]=[];
    try{ merchantCurrencies=extractMerchantCurrencies(await nowRequest("/merchant/coins",apiKey)); }
    catch(e:any){ console.error("[ZYNTH_NOWPAYMENTS_MERCHANT_COINS_FAILED]",String(e?.message||e).slice(0,500)); return NextResponse.json({error:"NOWPayments availability could not be verified. Please try again shortly."},{status:503}); }

    if(!merchantCurrencies.includes(payCurrency)) return NextResponse.json({error:"That cryptocurrency/network is no longer available for this NOWPayments merchant. Please choose another option."},{status:409});

    const fixedRate=false;
    const feePaidByUser=false;
    let providerMinimumUsd=0;
    try{
      const minInfo=await getNowPaymentsMinAmount(apiKey,payCurrency,fixedRate,feePaidByUser);
      providerMinimumUsd=minInfo.minimum;
      const requestedUsd=amount/usdNgnRate;
      if(requestedUsd<providerMinimumUsd){
        const minimumNgn=Math.ceil(providerMinimumUsd*usdNgnRate);
        return NextResponse.json({error:`This crypto network currently requires at least ₦${minimumNgn.toLocaleString("en-NG")} (about ${providerMinimumUsd.toFixed(2)}). Choose another network or increase the amount.`,code:"PROVIDER_MINIMUM",minimum_ngn:minimumNgn,minimum_usd:providerMinimumUsd},{status:400});
      }
    }catch(e:any){
      console.error("[ZYNTH_NOWPAYMENTS_MINIMUM_FAILED]",{payCurrency,error:String(e?.message||e).slice(0,500)});
      return NextResponse.json({error:"NOWPayments minimum-payment check is temporarily unavailable. Please try again shortly."},{status:503});
    }

    const {data:deposit,error:depositError}=await client.rpc("create_crypto_deposit_request",{p_user_id:user.id,p_amount:amount,p_strategy_id:strategyId||null,p_investment_id:investmentId||null});
    if(depositError){
      const map:any={
        DEPOSITS_DISABLED:"Deposits are temporarily paused.",ACCOUNT_RESTRICTED:"This account is restricted from creating new funding requests.",PENDING_DEPOSIT_EXISTS:"You already have a pending deposit. Check Activity before starting another.",PENDING_WITHDRAWAL_EXISTS:"You have a pending withdrawal. Complete or cancel it before starting a new deposit.",BELOW_MINIMUM:"That amount is below ZYNTH's minimum deposit.",BELOW_MINIMUM_INVESTMENT:"That amount is below this strategy's minimum investment.",ABOVE_MAXIMUM_INVESTMENT:"That amount is above this strategy's maximum investment.",STRATEGY_UNAVAILABLE:"That strategy is no longer available.",FUNDING_TARGET_REQUIRED:"Choose an investment funding target.",MULTIPLE_FUNDING_TARGETS:"Choose only one investment funding target.",INVESTMENT_UNAVAILABLE:"That investment is no longer available.",REDEMPTION_PENDING:"This investment has a pending exit and cannot be topped up."
      };
      return NextResponse.json({error:map[depositError.message]||depositError.message||"Unable to start crypto funding.",code:depositError.message},{status:400});
    }

    const callbackUrl=new URL("/api/payments/nowpayments/ipn",req.url).toString();
    try{
      const ngnAmount=Number(deposit.total_amount);
      const usdAmount=Math.round((ngnAmount/usdNgnRate)*1e8)/1e8;
      if(!Number.isFinite(usdAmount)||usdAmount<=0) throw new Error("Unable to calculate the USD settlement amount.");

      const payment=await nowRequest("/payment",apiKey,{method:"POST",body:JSON.stringify({
        price_amount:usdAmount,price_currency:pricingCurrency,pay_currency:payCurrency,ipn_callback_url:callbackUrl,order_id:deposit.id,order_description:`ZYNTH ${investmentId?"investment top-up":"investment deposit"} ${deposit.reference}`,is_fixed_rate:false,is_fee_paid_by_user:false
      })});

      if(!payment?.payment_id||!payment?.pay_address) throw new Error("NOWPayments returned an incomplete payment instruction.");

      const {data:record,error:recordError}=await client.rpc("record_nowpayments_payment_v2",{p_deposit_id:deposit.id,p_pay_currency:payCurrency,p_ngn_amount:ngnAmount,p_usd_amount:usdAmount,p_usd_ngn_rate:usdNgnRate,p_fx_source:fx.source,p_payment:payment});
      if(recordError) throw recordError;
      return NextResponse.json({ok:true,payment:record});
    }catch(e:any){
      await client.rpc("fail_nowpayments_checkout",{p_deposit_id:deposit.id,p_reason:"Crypto checkout could not be created: "+(e?.message||"provider error")});
      console.error("[ZYNTH_NOWPAYMENTS_CREATE_FAILED]",String(e?.message||e).slice(0,500));
      return NextResponse.json({error:e?.message||"Unable to create crypto payment."},{status:400});
    }
  }catch(e:any){
    console.error("[ZYNTH_NOWPAYMENTS_CREATE_FATAL]",String(e?.message||e).slice(0,500));
    return NextResponse.json({error:e?.message||"Unable to create crypto payment."},{status:500});
  }
}
