import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(_req:Request,{params}:{params:{id:string}}){
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

  const key=String(params.id||"").trim();
  if(!key)return NextResponse.json({error:"Crypto payment reference is required."},{status:400});

  // Activity stores the deposit_request_id. The crypto screen historically used
  // zynth_crypto_payments.id. Accept both identifiers so a pending transaction
  // can safely resume the exact existing NOWPayments checkout.
  let {data,error}=await client
    .from("zynth_crypto_payments")
    .select("id,deposit_id,nowpayments_payment_id,price_amount,price_currency,pay_amount,pay_currency,pay_address,payment_status,actually_paid,actually_paid_currency,transaction_hash,expiration_at,credited_at,created_at,updated_at,deposit_requests!inner(id,amount,total_amount,fee_amount,status,reference)")
    .eq("id",key)
    .eq("user_id",user.id)
    .maybeSingle();

  if(!data&&!error){
    const result=await client
      .from("zynth_crypto_payments")
      .select("id,deposit_id,nowpayments_payment_id,price_amount,price_currency,pay_amount,pay_currency,pay_address,payment_status,actually_paid,actually_paid_currency,transaction_hash,expiration_at,credited_at,created_at,updated_at,deposit_requests!inner(id,amount,total_amount,fee_amount,status,reference)")
      .eq("deposit_id",key)
      .eq("user_id",user.id)
      .maybeSingle();
    data=result.data;
    error=result.error;
  }

  if(error||!data)return NextResponse.json({error:"Crypto payment not found."},{status:404});
  return NextResponse.json({payment:data});
}
