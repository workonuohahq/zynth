import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(){
  try{
    const client=await createSupabaseServerClient();
    const {data:{user}}=await client.auth.getUser();
    if(!user) return NextResponse.json({error:"Authentication required."},{status:401});

    const {data,error}=await client.rpc("get_user_payment_methods");
    if(error){
      const message=error.message==="AUTHENTICATION_REQUIRED"?"Authentication required.":error.message;
      return NextResponse.json({error:message||"Payment configuration unavailable."},{status:error.message==="AUTHENTICATION_REQUIRED"?401:503});
    }

    const config:any=data||{};
    return NextResponse.json({
      ok:true,
      manual:{
        flutterwave:Boolean(config.manual?.flutterwave),
        paystack:Boolean(config.manual?.paystack)
      },
      crypto:{
        enabled:Boolean(config.crypto?.enabled),
        currencies:Array.isArray(config.crypto?.currencies)
          ? config.crypto.currencies.map((c:any)=>String(c?.currency_code||c).toLowerCase())
          : [],
        price_currency:config.crypto?.price_currency||"ngn",
        fixed_rate:Boolean(config.crypto?.fixed_rate),
        fee_paid_by_user:Boolean(config.crypto?.fee_paid_by_user)
      }
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Unable to load payment methods."},{status:500});
  }
}
