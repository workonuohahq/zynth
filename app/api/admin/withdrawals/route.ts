import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export async function GET(){
 try{
  const { supabase: client, user } = await getAdminContext();
  if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
  const {data,error}=await client.rpc("admin_withdrawal_queue");
  if(error)return NextResponse.json({error:"Unable to load withdrawal queue."},{status:403});
  return NextResponse.json({withdrawals:Array.isArray(data)?data:[]});
 }catch{return NextResponse.json({error:"Unable to load withdrawal queue."},{status:500});}
}