import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {extractMerchantCurrencies,getNowPaymentsSettings,nowRequest,requireApiKey} from "@/lib/nowpayments";

export async function POST(req:Request){
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

  const admin=createSupabaseAdminClient();
  const settings=await getNowPaymentsSettings(admin);
  if(!settings.enabled) return NextResponse.json({error:"Crypto payments are temporarily unavailable."},{status:503});

  const {data:catalogEntry,error:catalogError}=await admin
    .from("zynth_payment_currencies")
    .select("currency_code,provider_available,zynth_enabled")
    .eq("provider","nowpayments")
    .eq("currency_code",payCurrency)
    .maybeSingle();
  if(catalogError) return NextResponse.json({error:"Crypto asset configuration is temporarily unavailable."},{status:503});
  if(!catalogEntry?.zynth_enabled) return NextResponse.json({error:"That cryptocurrency/network is not enabled for ZYNTH."},{status:400});

  const apiKey=requireApiKey(settings);
  let merchantCurrencies:string[]=[];
  try{
    merchantCurrencies=extractMerchantCurrencies(await nowRequest("/merchant/coins",apiKey));
  }catch(e:any){
    return NextResponse.json({error:"NOWPayments availability could not be verified. Please try again shortly."},{status:503});
  }

  if(!merchantCurrencies.includes(payCurrency)){
    await admin.from("zynth_payment_currencies").update({
      provider_available:false,
      last_synced_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("provider","nowpayments").eq("currency_code",payCurrency);
    return NextResponse.json({error:"That cryptocurrency/network is no longer available for this NOWPayments merchant. Please choose another option."},{status:409});
  }

  if(!catalogEntry.provider_available){
    await admin.from("zynth_payment_currencies").update({
      provider_available:true,
      last_seen_at:new Date().toISOString(),
      last_synced_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("provider","nowpayments").eq("currency_code",payCurrency);
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
      STRATEGY_REQUIRED:"A strategy is required.",
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

    const {data:record,error:recordError}=await admin.from("zynth_crypto_payments").insert({
      user_id:user.id,
      deposit_id:deposit.id,
      nowpayments_payment_id:String(payment.payment_id),
      order_id:String(deposit.id),
      price_amount:Number(deposit.total_amount),
      price_currency:settings.price_currency,
      pay_amount:payment.pay_amount??null,
      pay_currency:payCurrency,
      pay_address:payment.pay_address,
      payment_status:String(payment.payment_status||"waiting").toLowerCase(),
      expiration_at:payment.expiration_estimate_date||null,
      provider_payload:payment
    }).select("*").single();

    if(recordError) throw recordError;
    return NextResponse.json({ok:true,payment:record});
  }catch(e:any){
    await admin.from("deposit_requests").update({status:"rejected",admin_note:"Crypto checkout could not be created: "+(e?.message||"provider error"),processed_at:new Date().toISOString()}).eq("id",deposit.id).eq("status","pending");
    await admin.from("transactions").update({status:"failed",failure_reason:"Crypto checkout could not be created.",processed_at:new Date().toISOString()}).eq("reference",deposit.reference).eq("status","pending");
    await admin.from("transactions").update({status:"failed",failure_reason:"Crypto checkout could not be created.",processed_at:new Date().toISOString()}).eq("reference","FEE-DEP-"+deposit.id).eq("status","pending");
    return NextResponse.json({error:e?.message||"Unable to create crypto payment."},{status:400});
  }
}
