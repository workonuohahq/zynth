import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(){
 try{
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.from("withdrawal_beneficiaries").select("id,bank_name,account_number,account_name,is_verified,is_default,created_at").eq("user_id",user.id).order("is_default",{ascending:false}).order("created_at",{ascending:false});
  if(error)throw error;
  return NextResponse.json({beneficiaries:data||[]});
 }catch{ return NextResponse.json({error:"Unable to load payout accounts."},{status:500});}
}

export async function POST(request:Request){
 try{
  const body=await request.json();
  const bankName=String(body?.bankName||"").trim(), accountNumber=String(body?.accountNumber||"").replace(/\D/g,""), accountName=String(body?.accountName||"").trim();
  if(!bankName||!/^[0-9]{10}$/.test(accountNumber)||!accountName)return NextResponse.json({error:"Enter a valid bank name, 10-digit account number and account name."},{status:400});
  const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data:existing}=await client.from("withdrawal_beneficiaries").select("id").eq("user_id",user.id);
  const {data,error}=await client.from("withdrawal_beneficiaries").insert({user_id:user.id,bank_name:bankName,account_number:accountNumber,account_name:accountName,is_default:!(existing||[]).length}).select("id,bank_name,account_number,account_name,is_verified,is_default").single();
  if(error){if(error.code==="23505")return NextResponse.json({error:"That payout account is already saved."},{status:409});throw error;}
  return NextResponse.json({ok:true,beneficiary:data});
 }catch{ return NextResponse.json({error:"Unable to save payout account."},{status:500});}
}