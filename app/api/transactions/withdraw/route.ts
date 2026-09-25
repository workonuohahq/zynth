import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    const body=await request.json(); const amount=Number(body?.amount);
    if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"Enter a valid amount."},{status:400});
    const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
    if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
    const {data,error}=await client.rpc("request_withdrawal",{p_user_id:user.id,p_amount:amount});
    if(error){const status=/INSUFFICIENT|INVALID_AMOUNT|USER_NOT_FOUND|WITHDRAWAL_TOO_SMALL|AUTHORIZATION|PENDING_DEPOSIT_EXISTS|PENDING_WITHDRAWAL_EXISTS|ACCOUNT_RESTRICTED/.test(error.message)?400:503;return NextResponse.json({error:error.message==="ACCOUNT_RESTRICTED"?"This account is restricted from withdrawals. Contact support if you believe this is an error.":error.message==="PENDING_WITHDRAWAL_EXISTS"?"You already have a pending withdrawal. Check Activity to view its status or cancel it before starting another.":error.message==="PENDING_DEPOSIT_EXISTS"?"You have a pending deposit. Complete or cancel it before starting a withdrawal.":"Unable to submit withdrawal.",code:error.message},{status});}
    return NextResponse.json({ok:true,withdrawal:data});
  }catch(error){console.error(error);return NextResponse.json({error:"Unable to submit withdrawal."},{status:500});}
}