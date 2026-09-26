import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data:p}=await s.from("users").select("role,full_name,email,account_status").eq("id",user.id).single();
 if(p?.role!=="trader"||p.account_status!=="active")return NextResponse.json({error:"Trader access required."},{status:403});

 const {data:profile}=await s.from("zynth_trader_profiles").select("*").eq("user_id",user.id).maybeSingle();
 const {data:mt5}=await s.from("zynth_trader_mt5_credentials").select("id,mt5_login,mt5_server,status,submitted_at,verified_at,rejection_reason,updated_at").eq("user_id",user.id).maybeSingle();
 const {data:strategies,error:strategyError}=await s.from("zynth_strategies")
   .select("id,name,description,status,starting_balance,current_reported_balance,starting_nav,nav,total_units,high_water_mark,performance_fee_pct,currency,timezone,cutoff_time,require_flat_day,minimum_investment,maximum_investment,created_at,updated_at")
   .eq("trader_id",user.id).order("created_at",{ascending:false});
 if(strategyError)return NextResponse.json({error:strategyError.message},{status:400});

 const ids=(strategies||[]).map(x=>x.id);
 let reports:any[]=[];
 if(ids.length){
   const {data,error}=await s.from("zynth_daily_reports")
     .select("id,strategy_id,report_date,opening_balance,closing_balance,external_deposit,external_withdrawal,trading_pnl,return_pct,status,rejection_reason,note,positions_flat,submitted_at,confirmed_at")
     .in("strategy_id",ids).order("report_date",{ascending:false}).limit(120);
   if(error)return NextResponse.json({error:error.message},{status:400});
   reports=data||[];
 }
 return NextResponse.json({user:p,profile,mt5:mt5||null,strategies:strategies||[],reports});
}
