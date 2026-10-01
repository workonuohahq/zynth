import {NextResponse} from "next/server";
import {getAdminContext} from "@/lib/admin/auth";
import {encryptProviderSecret,maskSecret} from "@/lib/secure-provider-secrets";
import {extractMerchantCurrencies,getNowPaymentsSettings,inferCurrencyName,inferCurrencyNetwork,nowRequest,requireApiKey} from "@/lib/nowpayments";

function normalizeCodes(values:any){
  return Array.from(new Set((Array.isArray(values)?values:[]).map((x:any)=>String(x).trim().toLowerCase()).filter(Boolean)));
}

async function syncMerchantCatalog(supabase:any){
  const settings=await getNowPaymentsSettings(supabase);
  const apiKey=requireApiKey(settings);
  const merchantPayload=await nowRequest("/merchant/coins",apiKey);
  const codes=extractMerchantCurrencies(merchantPayload);
  if(!codes.length) throw new Error("NOWPayments returned no merchant-enabled payment assets.");

  const now=new Date().toISOString();
  const rows=codes.map((code)=>({
    provider:"nowpayments",
    currency_code:code,
    symbol:code.toUpperCase(),
    name:inferCurrencyName(code),
    network:inferCurrencyNetwork(code),
    provider_available:true,
    last_seen_at:now,
    last_synced_at:now,
    metadata:{source:"NOWPayments /merchant/coins"}
  }));

  const {data:existing,error:existingError}=await supabase
    .from("zynth_payment_currencies")
    .select("currency_code,zynth_enabled")
    .eq("provider","nowpayments");
  if(existingError) throw existingError;

  const selected=new Set((existing||[]).filter((x:any)=>x.zynth_enabled).map((x:any)=>String(x.currency_code).toLowerCase()));
  const selectedCodes=codes.filter((code)=>selected.has(code));

  const {error:upsertError}=await supabase.from("zynth_payment_currencies").upsert(rows,{onConflict:"provider,currency_code"});
  if(upsertError) throw upsertError;

  const {error:staleError}=await supabase.from("zynth_payment_currencies")
    .update({provider_available:false,last_synced_at:now,updated_at:now})
    .eq("provider","nowpayments")
    .not("currency_code","in","("+codes.map((c)=>"\""+c.replace(/"/g,'""')+"\"").join(",")+")");
  if(staleError) throw staleError;

  const {error:settingsError}=await supabase.from("zynth_payment_provider_settings")
    .update({currency_catalog_synced_at:now,supported_currencies:selectedCodes,updated_at:now})
    .eq("provider","nowpayments");
  if(settingsError) throw settingsError;

  return {settings,available:codes,selected:selectedCodes,syncedAt:now};
}

export async function GET(){
  try{
    const {supabase,user}=await getAdminContext();
    if(!user) return NextResponse.json({error:"Administrator access required."},{status:403});
    const [{data,error},{data:catalog,error:catalogError}]=await Promise.all([
      supabase.from("zynth_payment_provider_settings").select("*").eq("provider","nowpayments").single(),
      supabase.from("zynth_payment_currencies").select("currency_code,symbol,name,network,provider_available,zynth_enabled,last_seen_at,last_synced_at,metadata").eq("provider","nowpayments").order("name",{ascending:true})
    ]);
    if(error) throw error;
    if(catalogError) throw catalogError;
    return NextResponse.json({
      settings:{
        enabled:data.enabled,
        price_currency:"usd",
        usd_ngn_rate:data.usd_ngn_rate,
        fx_source:data.fx_source,
        fx_updated_at:data.fx_updated_at,
        fixed_rate:data.fixed_rate,
        fee_paid_by_user:data.fee_paid_by_user,
        supported_currencies:Array.isArray(data.supported_currencies)?data.supported_currencies:[],
        api_key_configured:Boolean(data.api_key_ciphertext),
        ipn_secret_configured:Boolean(data.ipn_secret_ciphertext),
        api_key_masked:maskSecret(data.api_key_ciphertext?"configured":""),
        ipn_secret_masked:maskSecret(data.ipn_secret_ciphertext?"configured":""),
        last_test_at:data.last_test_at,
        last_test_status:data.last_test_status,
        last_test_message:data.last_test_message,
        currency_catalog_synced_at:data.currency_catalog_synced_at
      },
      currencies:catalog||[]
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Unable to load crypto payment settings."},{status:500});
  }
}

export async function PATCH(req:Request){
  try{
    const {supabase,user}=await getAdminContext();
    if(!user) return NextResponse.json({error:"Administrator access required."},{status:403});
    const b=await req.json().catch(()=>({}));
    const {data:catalog,error:catalogError}=await supabase.from("zynth_payment_currencies").select("currency_code,provider_available").eq("provider","nowpayments");
    if(catalogError) throw catalogError;
    const available=new Set((catalog||[]).filter((x:any)=>x.provider_available).map((x:any)=>String(x.currency_code).toLowerCase()));
    const requested=normalizeCodes(b.zynth_enabled_currencies);
    const enabled=requested.filter((code)=>available.has(code));
    if(Boolean(b.enabled)&&!enabled.length) return NextResponse.json({error:"Select at least one currently available NOWPayments asset before enabling crypto deposits."},{status:400});
    // FX is now resolved automatically at checkout; the admin no longer sets a rate.
    const patch:any={
      enabled:Boolean(b.enabled),
      price_currency:"usd",
      usd_ngn_rate:Number(b.usd_ngn_rate),
      fx_source:String(b.fx_source||"ZYNTH controlled FX rate").trim().slice(0,120),
      fx_updated_at:new Date().toISOString(),
      fixed_rate:Boolean(b.fixed_rate),
      fee_paid_by_user:Boolean(b.fee_paid_by_user),
      supported_currencies:enabled,
      updated_at:new Date().toISOString()
    };
    if(String(b.api_key||"").trim()) { patch.api_key_ciphertext=encryptProviderSecret(String(b.api_key)); patch.api_key_updated_at=new Date().toISOString(); }
    if(String(b.ipn_secret||"").trim()) { patch.ipn_secret_ciphertext=encryptProviderSecret(String(b.ipn_secret)); patch.ipn_secret_updated_at=new Date().toISOString(); }

    const {error}=await supabase.from("zynth_payment_provider_settings").update(patch).eq("provider","nowpayments");
    if(error) throw error;

    const {error:catalogUpdateError}=await supabase.from("zynth_payment_currencies").update({zynth_enabled:false,updated_at:new Date().toISOString()}).eq("provider","nowpayments");
    if(catalogUpdateError) throw catalogUpdateError;
    if(enabled.length){
      const {error:enableError}=await supabase.from("zynth_payment_currencies").update({zynth_enabled:true,updated_at:new Date().toISOString()}).eq("provider","nowpayments").in("currency_code",enabled);
      if(enableError) throw enableError;
    }
    return GET();
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Unable to save crypto payment settings."},{status:500});
  }
}

export async function POST(){
  const {supabase,user}=await getAdminContext();
  if(!user) return NextResponse.json({error:"Administrator access required."},{status:403});
  try{
    const result=await syncMerchantCatalog(supabase);
    const {data:settings,error:settingsError}=await supabase
      .from("zynth_payment_provider_settings")
      .select("supported_currencies")
      .eq("provider","nowpayments")
      .single();
    if(settingsError) throw settingsError;
    const selected=normalizeCodes(settings?.supported_currencies);
    const message="NOWPayments API verified. Synced "+result.available.length+" merchant-enabled asset(s); "+selected.length+" currently selected for ZYNTH.";
    const {error:updateError}=await supabase.from("zynth_payment_provider_settings").update({
      last_test_at:new Date().toISOString(),
      last_test_status:"success",
      last_test_message:message,
      updated_at:new Date().toISOString()
    }).eq("provider","nowpayments");
    if(updateError) throw updateError;
    return NextResponse.json({ok:true,available:result.available,selected:result.selected,synced_at:result.syncedAt,message});
  }catch(e:any){
    try{
      await supabase.from("zynth_payment_provider_settings").update({
        last_test_at:new Date().toISOString(),
        last_test_status:"failed",
        last_test_message:e?.message||"NOWPayments synchronization failed.",
        updated_at:new Date().toISOString()
      }).eq("provider","nowpayments");
    }catch{}
    return NextResponse.json({error:e?.message||"NOWPayments synchronization failed."},{status:400});
  }
}
