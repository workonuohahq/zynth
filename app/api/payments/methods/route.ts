import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";

export async function GET(){
  try{
    const client=await createSupabaseServerClient();
    const {data:{user}}=await client.auth.getUser();
    if(!user) return NextResponse.json({error:"Authentication required."},{status:401});

    const [{data:manualRaw,error:manualError},{data:providerRaw,error:providerError}]=await Promise.all([
      client.rpc("get_deposit_payment_config").single(),
      createSupabaseAdminClient().from("zynth_payment_provider_settings").select("enabled,price_currency,fixed_rate,fee_paid_by_user,api_key_ciphertext,ipn_secret_ciphertext,last_test_status").eq("provider","nowpayments").maybeSingle()
    ]);
    const manual:any=manualRaw||{};
    const provider:any=providerRaw||null;
    if(manualError||!manual) return NextResponse.json({error:"Payment configuration unavailable."},{status:503});
    if(providerError) return NextResponse.json({error:"Payment provider configuration unavailable."},{status:503});

    const {data:catalog,error:catalogError}=await createSupabaseAdminClient()
      .from("zynth_payment_currencies")
      .select("currency_code,provider_available,zynth_enabled")
      .eq("provider","nowpayments")
      .eq("provider_available",true)
      .eq("zynth_enabled",true)
      .order("currency_code",{ascending:true});
    if(catalogError) return NextResponse.json({error:"Crypto asset catalog unavailable."},{status:503});

    const currencies=(catalog||[]).map((x:any)=>String(x.currency_code).toLowerCase());
    const cryptoReady=Boolean(
      provider?.enabled &&
      provider?.api_key_ciphertext &&
      provider?.ipn_secret_ciphertext &&
      provider?.last_test_status==="success" &&
      currencies.length
    );

    return NextResponse.json({
      ok:true,
      manual:{
        flutterwave:manual.flutterwave_enabled,
        paystack:manual.paystack_enabled
      },
      crypto:{
        enabled:cryptoReady,
        currencies:cryptoReady?currencies:[],
        price_currency:provider?.price_currency||"ngn",
        fixed_rate:Boolean(provider?.fixed_rate),
        fee_paid_by_user:Boolean(provider?.fee_paid_by_user)
      }
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Unable to load payment methods."},{status:500});
  }
}
