import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
export async function GET(_request:Request,{params}:{params:{id:string}}){
 try{
  const { supabase: client, user } = await getAdminContext(); if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
  const {data,error}=await client.rpc("admin_withdrawal_detail",{p_withdrawal_id:params.id});
  if(error)return NextResponse.json({error:error.message==="WITHDRAWAL_NOT_FOUND"?"Withdrawal not found.":"Unable to load withdrawal details."},{status:error.message==="WITHDRAWAL_NOT_FOUND"?404:403});
  return NextResponse.json(data);
 }catch{return NextResponse.json({error:"Unable to load withdrawal details."},{status:500});}
}