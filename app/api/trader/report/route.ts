import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req:Request){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:"Authentication required."},{status:401});
  const b=await req.json().catch(()=>({}));
  const {data,error}=await supabase.rpc("zynth_submit_daily_report",{
    p_strategy_id:String(b.strategyId||""),p_report_date:String(b.reportDate||""),
    p_closing_balance:Number(b.closingBalance),p_external_deposit:Number(b.externalDeposit||0),
    p_external_withdrawal:Number(b.externalWithdrawal||0),p_evidence_url:b.evidenceUrl||null,
    p_note:b.note||null,p_positions_flat:b.positionsFlat!==false
  });
  if(error) return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json(data);
}