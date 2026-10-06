import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

const messages:any={
  KYC_REQUIRED:"KYC verification is required before withdrawals. Complete KYC to continue.",\n  PIN_NOT_SET:"Set your 6-digit withdrawal PIN in Security Center before withdrawing.",
  INVALID_PIN:"Incorrect withdrawal PIN.",
  PIN_LOCKED:"Withdrawal PIN is temporarily locked after too many failed attempts. Try again later.",
  PIN_MUST_BE_6_DIGITS:"Enter your 6-digit withdrawal PIN.",
  PIN_TOO_WEAK:"Choose a stronger 6-digit PIN.",
  BENEFICIARY_COOLING_DOWN:"This payout account is protected by a 24-hour security cooling period before withdrawals can use it.",
  ACCOUNT_RESTRICTED:"This account is restricted from withdrawals. Contact support if you believe this is an error.",
  PENDING_WITHDRAWAL_EXISTS:"You already have an active withdrawal. Check Activity to track or cancel it before starting another.",
  PENDING_DEPOSIT_EXISTS:"You have a pending deposit. Complete or cancel it before starting a withdrawal.",
  WITHDRAWALS_DISABLED:"Withdrawals are temporarily unavailable.",
  WITHDRAWAL_TOO_SMALL:"The amount is below the current minimum withdrawal.",
  BENEFICIARY_REQUIRED:"Select a payout account.",
  BENEFICIARY_NOT_FOUND:"That payout account could not be found.",
  INSUFFICIENT_BALANCE:"The amount exceeds your available cash.",
  INSUFFICIENT_WITHDRAWABLE_PROFIT:"The amount exceeds your eligible Vault Profit.",
  INSUFFICIENT_ZPA_EARNINGS:"The amount exceeds your available ZPA Earnings.",
  INSUFFICIENT_TOTAL_WITHDRAWABLE:"The amount exceeds your total withdrawable balance.",
  ZPA_ACCESS_REQUIRED:"ZPA Earnings are only available to active ZPA partners."
};

export async function POST(request:Request){
 try{
  const body=await request.json();
  const amount=Number(body?.amount);
  const beneficiaryId=String(body?.beneficiaryId||"");
  const source=String(body?.source||"cash");
  const pin=String(body?.pin||"").trim();
  if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"Enter a valid amount."},{status:400});
  if(!beneficiaryId)return NextResponse.json({error:"Select a payout account."},{status:400});
  if(!["cash","profit","zpa","all"].includes(source))return NextResponse.json({error:"Select a valid withdrawal source."},{status:400});
  if(!/^\d{6}$/.test(pin))return NextResponse.json({error:"Enter your 6-digit withdrawal PIN.",code:"PIN_MUST_BE_6_DIGITS"},{status:400});
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("request_withdrawal_by_source",{p_user_id:user.id,p_amount:amount,p_beneficiary_id:beneficiaryId,p_source:source,p_pin:pin});
  if(error){
   const code=error.message;\n   if(code==="KYC_REQUIRED") return NextResponse.json({error:messages.KYC_REQUIRED,code,redirectTo:"/dashboard/kyc"},{status:403});
   const status=/PIN_|BENEFICIARY_COOLING|INSUFFICIENT|INVALID_AMOUNT|INVALID_WITHDRAWAL_SOURCE|USER_NOT_FOUND|WITHDRAWAL_TOO_SMALL|AUTHORIZATION|PENDING_DEPOSIT_EXISTS|PENDING_WITHDRAWAL_EXISTS|ACCOUNT_RESTRICTED|WITHDRAWALS_DISABLED|BENEFICIARY_REQUIRED|BENEFICIARY_NOT_FOUND|ZPA_ACCESS_REQUIRED/.test(code)?400:503;
   return NextResponse.json({error:messages[code]||"Unable to submit withdrawal.",code},{status});
  }
  return NextResponse.json({ok:true,withdrawal:data});
 }catch(error){console.error(error);return NextResponse.json({error:"Unable to submit withdrawal."},{status:500});}
}