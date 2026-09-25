import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(){
 try{const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const [{data:u},{data:settings}]=await Promise.all([s.from("users").select("main_wallet_balance,locked_vault_balance").eq("id",user.id).single(),s.from("system_settings").select("exit_fee_pct,global_min_withdrawal,withdrawals_enabled,withdrawal_processing_notice").single()]);
 return NextResponse.json({available:Number(u?.main_wallet_balance||0),locked:Number(u?.locked_vault_balance||0),exitFeePct:Number(settings?.exit_fee_pct||0),minWithdrawal:Number(settings?.global_min_withdrawal||1000),withdrawalsEnabled:settings?.withdrawals_enabled!==false,withdrawalNotice:String(settings?.withdrawal_processing_notice||"")});
 }catch{return NextResponse.json({error:"Unable to load account summary."},{status:500});}
}