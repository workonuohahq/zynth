import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(_request:Request,{params}:{params:{id:string}}){
 try{
  const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("admin_withdrawal_detail",{p_withdrawal_id:params.id});
  if(error)return NextResponse.json({error:error.message==="WITHDRAWAL_NOT_FOUND"?"Withdrawal not found.":"Unable to load withdrawal details."},{status:error.message==="WITHDRAWAL_NOT_FOUND"?404:403});
  return NextResponse.json(data);
 }catch{return NextResponse.json({error:"Unable to load withdrawal details."},{status:500});}
}