import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request:Request,{params}:{params:{id:string}}){
 try{
  const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.from("withdrawal_requests").select("id,reference,gross_amount,fee_amount,net_amount,fee_pct,currency,bank_name,account_number,account_name,status,failure_reason,created_at,reviewed_at,processing_at,paid_at,cancelled_at,metadata").eq("id",params.id).eq("user_id",user.id).single();
  if(error||!data)return NextResponse.json({error:"Withdrawal not found."},{status:404});
  return NextResponse.json({withdrawal:data});
 }catch{return NextResponse.json({error:"Unable to load withdrawal."},{status:500});}
}