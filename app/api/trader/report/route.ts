import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function POST(req:Request){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const b=await req.json().catch(()=>({}));
 const {data,error}=await supabase.rpc("zynth_submit_daily_report",{
   p_strategy_id:String(b.strategyId||""),
   p_report_date:b.reportDate||null,
   p_closing_balance:Number(b.closingBalance),
   p_external_deposit:Number(b.externalDeposit||0),
   p_external_withdrawal:Number(b.externalWithdrawal||0),
   p_note:b.note||null,
   p_positions_flat:Boolean(b.positionsFlat),
   p_realized_pnl:Number(b.realizedPnl||0),
   p_unrealized_pnl:Number(b.unrealizedPnl||0)
 });
 if(error){
   const msg=error.message||"Unable to submit report.";
   const status=msg.includes("REPORTING_WINDOW_CLOSED")||msg.includes("REPORT_ALREADY_EXISTS")?409:400;
   return NextResponse.json({error:msg},{status});
 }
 return NextResponse.json(data);
}