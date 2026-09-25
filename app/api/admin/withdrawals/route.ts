import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(){
 try{
  const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("admin_withdrawal_queue");
  if(error)return NextResponse.json({error:"Unable to load withdrawal queue."},{status:403});
  return NextResponse.json({rows:data||[]});
 }catch{return NextResponse.json({error:"Unable to load withdrawal queue."},{status:500});}
}