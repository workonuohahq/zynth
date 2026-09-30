import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {decryptProviderSecret} from "@/lib/secure-provider-secrets";
import {extractMerchantCurrencies,nowRequest} from "@/lib/nowpayments";

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
    const {data:settings,error:settingsError}=await client.rpc("get_nowpayments_runtime_config");
    if(settingsError||!settings){
      return NextResponse.json({error:"Crypto payment configuration is unavailable."},{status:503});
    }
    if(!settings.enabled||settings.last_test_status!=="success"){
      return NextResponse.json({error:"Crypto payments are temporarily unavailable."},{status:503});
    }
    if(!settings.api_key_ciphertext){
      return NextResponse.json({error:"Crypto payment configuration is incomplete."},{status:503});
    }

    // Server-side invariant: the fiat pricing currency can never be the crypto target.
    // This blocks stale PWA/Vercel clients from ever sending NGN -> NGN to NOWPayments.
    const fiatPriceCurrency = String(settings.price_currency || "ngn").toLowerCase().trim();
    if(payCurrency === fiatPriceCurrency || payCurrency === "ngn"){
      return NextResponse.json({error:"NGN is the pricing currency, not a crypto payment option. Please choose a supported cryptocurrency/network."},{status:400});
    }


    let apiKey:string;
    try{
      apiKey=decryptProviderSecret(settings.api_key_ciphertext);
    }catch{
      return NextResponse.json({error:"Crypto payment configuration is invalid. Please contact support."},{status:503});
    }
    if(!apiKey) return NextResponse.json({error:"Crypto payment configuration is incomplete."},{status:503});

    const {data:catalogEntry,error:catalogError}=await client
      .from("zynth_payment_currencies")
      .select("currency_code,provider_available,zynth_enabled")
      .eq("provider","nowpayments")
      .eq("currency_code",payCurrency)
      .maybeSingle();

    if(catalogError) return NextResponse.json({error:"Crypto asset configuration is temporarily unavailable."},{status:503});
    if(!catalogEntry?.provider_available || !catalogEntry?.zynth_enabled || payCurrency===fiatPriceCurrency || payCurrency==="ngn") return NextResponse.json({error:"That cryptocurrency/network is not currently available for ZYNTH crypto funding."},{status:400});

    let merchantCurrencies:string[]=[];
    try{
      merchantCurrencies=extractMerchantCurrencies(await nowRequest("/merchant/coins",apiKey));
    }catch{
      return NextResponse.json({error:"NOWPayments availability could not be verified. Please try again shortly."},{status:503});
    }

    if(!merchantCurrencies.includes(payCurrency)){
      return NextResponse.json({error:"That cryptocurrency/network is no longer available for this NOWPayments merchant. Please choose another option."},{status:409});
    }

    const {data:deposit,error:depositError}=await client.rpc("create_crypto_deposit_request",{
      p_user_id:user.id,
      p_amount:amount,
      p_strategy_id:strategyId||null,
      p_investment_id:investmentId||null
    });

    if(depositError){
      const map:any={
        DEPOSITS_DISABLED:"Deposits are temporarily paused.",
        ACCOUNT_RESTRICTED:"This account is restricted from creating new funding requests.",
        PENDING_DEPOSIT_EXISTS:"You already have a pending deposit. Check Activity before starting another.",
        PENDING_WITHDRAWAL_EXISTS:"You have a pending withdrawal. Complete or cancel it before starting a new deposit.",
        BELOW_MINIMUM:"That amount is below ZYNTH's minimum deposit.",
        BELOW_MINIMUM_INVESTMENT:"That amount is below this strategy's minimum investment.",
        ABOVE_MAXIMUM_INVESTMENT:"That amount is above this strategy's maximum investment.",
        STRATEGY_UNAVAILABLE:"That strategy is no longer available.",
        FUNDING_TARGET_REQUIRED:"Choose an investment funding target.",
        MULTIPLE_FUNDING_TARGETS:"Choose only one investment funding target.",
        INVESTMENT_UNAVAILABLE:"That investment is no longer available.",
        REDEMPTION_PENDING:"This investment has a pending exit and cannot be topped up."
      };
      return NextResponse.json({error:map[depositError.message]||depositError.message||"Unable to start crypto funding.",code:depositError.message},{status:400});
    }

    const callbackUrl=new URL("/api/payments/nowpayments/ipn",req.url).toString();

    try{
      const min=await nowRequest(
        `/min-amount?currency_from=${encodeURIComponent(settings.price_currency)}&currency_to=${encodeURIComponent(payCurrency)}&fiat_equivalent=${encodeURIComponent(settings.price_currency)}&is_fixed_rate=${settings.fixed_rate}&is_fee_paid_by_user=${settings.fee_paid_by_user}`,
        apiKey
      );

      if(Number.isFinite(Number(min?.fiat_equivalent))&&Number(deposit.total_amount)<Number(min.fiat_equivalent)){
        throw new Error(`This crypto option requires a minimum payment of ₦${Number(min.fiat_equivalent).toLocaleString("en-NG")}.`);
      }

      const payment=await nowRequest("/payment",apiKey,{
        method:"POST",
        body:JSON.stringify({
          price_amount:Number(deposit.total_amount),
          price_currency:settings.price_currency,
          pay_currency:payCurrency,
          ipn_callback_url:callbackUrl,
          order_id:deposit.id,
          order_description:`ZYNTH ${investmentId?"investment top-up":"investment deposit"} ${deposit.reference}`,
          is_fixed_rate:settings.fixed_rate,
          is_fee_paid_by_user:settings.fee_paid_by_user
        })
      });

      if(!payment?.payment_id||!payment?.pay_address) throw new Error("NOWPayments returned an incomplete payment instruction.");

      const {data:record,error:recordError}=await client.rpc("record_nowpayments_payment",{
        p_deposit_id:deposit.id,
        p_pay_currency:payCurrency,
        p_price_amount:Number(deposit.total_amount),
        p_price_currency:settings.price_currency,
        p_payment:payment
      });

      if(recordError) throw recordError;
      return NextResponse.json({ok:true,payment:record});
    }catch(e:any){
      await client.rpc("fail_nowpayments_checkout",{
        p_deposit_id:deposit.id,
        p_reason:"Crypto checkout could not be created: "+(e?.message||"provider error")
      });
      return NextResponse.json({error:e?.message||"Unable to create crypto payment."},{status:400});
    }
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Unable to create crypto payment."},{status:500});
  }
}
