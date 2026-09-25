import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
 try {
  const body=await request.json(); const amount=Number(body?.amount); const beneficiaryId=String(body?.beneficiaryId||"");
  if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"Enter a valid amount."},{status:400});
  if(!beneficiaryId)return NextResponse.json({error:"Select a payout account."},{status:400});
  const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("request_withdrawal",{p_user_id:user.id,p_amount:amount,p_beneficiary_id:beneficiaryId});
  if(error){
   const status=/INSUFFICIENT|INVALID_AMOUNT|USER_NOT_FOUND|WITHDRAWAL_TOO_SMALL|AUTHORIZATION|PENDING_DEPOSIT_EXISTS|PENDING_WITHDRAWAL_EXISTS|ACCOUNT_RESTRICTED|WITHDRAWALS_DISABLED|BENEFICIARY_REQUIRED|BENEFICIARY_NOT_FOUND/.test(error.message)?400:503;
   const messages:any={ACCOUNT_RESTRICTED:"This account is restricted from withdrawals. Contact support if you believe this is an error.",PENDING_WITHDRAWAL_EXISTS:"You already have an active withdrawal. Check Activity to track or cancel it before starting another.",PENDING_DEPOSIT_EXISTS:"You have a pending deposit. Complete or cancel it before starting a withdrawal.",WITHDRAWALS_DISABLED:"Withdrawals are temporarily unavailable.",WITHDRAWAL_TOO_SMALL:"The amount is below the current minimum withdrawal.",BENEFICIARY_REQUIRED:"Select a payout account.",BENEFICIARY_NOT_FOUND:"That payout account could not be found."};
   return NextResponse.json({error:messages[error.message]||"Unable to submit withdrawal.",code:error.message},{status});
  }
  return NextResponse.json({ok:true,withdrawal:data});
 }catch(error){console.error(error);return NextResponse.json({error:"Unable to submit withdrawal."},{status:500});}
}