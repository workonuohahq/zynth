import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(){
 try{
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.from("withdrawal_beneficiaries").select("id,bank_name,account_number,account_name,is_verified,is_default,created_at,security_locked_until").eq("user_id",user.id).order("is_default",{ascending:false}).order("created_at",{ascending:false});
  if(error)throw error;
  return NextResponse.json({beneficiaries:data||[]});
 }catch{ return NextResponse.json({error:"Unable to load payout accounts."},{status:500});}
}

export async function POST(request:Request){
 try{
  const body=await request.json();
  const bankName=String(body?.bankName||"").trim(),accountNumber=String(body?.accountNumber||"").replace(/\D/g,""),accountName=String(body?.accountName||"").trim();
  if(!bankName||!/^[0-9]{10}$/.test(accountNumber)||!accountName)return NextResponse.json({error:"Enter a valid bank name, 10-digit account number and account name."},{status:400});
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("zynth_add_withdrawal_beneficiary",{p_bank_name:bankName,p_account_number:accountNumber,p_account_name:accountName});
  if(error){
   const code=error.message;
   return NextResponse.json({error:code==="BENEFICIARY_ALREADY_EXISTS"?"That payout account is already saved.":code==="INVALID_BENEFICIARY"?"Enter valid payout account details.":"Unable to save payout account.",code},{status:code==="BENEFICIARY_ALREADY_EXISTS"?409:400});
  }
  const {data:beneficiary,error:readError}=await client.from("withdrawal_beneficiaries").select("id,bank_name,account_number,account_name,is_verified,is_default,created_at,security_locked_until").eq("id",data?.beneficiary_id).single();
  if(readError)throw readError;
  return NextResponse.json({ok:true,beneficiary});
 }catch{ return NextResponse.json({error:"Unable to save payout account."},{status:500});}
}