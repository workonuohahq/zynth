import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data:p}=await s.from("users").select("role,full_name,email").eq("id",user.id).single();if(p?.role!=="trader")return NextResponse.json({error:"Trader access required."},{status:403});
 const {data:profile}=await s.from("zynth_trader_profiles").select("*").eq("user_id",user.id).maybeSingle();
 const {data:strategies}=await s.from("zynth_strategies").select("id,name,description,status,starting_balance,current_reported_balance,nav,total_units,cutoff_time,require_flat_day,minimum_investment,maximum_investment,created_at").eq("trader_id",user.id).order("created_at",{ascending:false});
 const ids=(strategies||[]).map(x=>x.id);let reports:any[]=[];if(ids.length){const {data}=await s.from("zynth_daily_reports").select("id,strategy_id,report_date,opening_balance,reported_closing_balance,reported_return_pct,trading_pnl,status,rejection_reason,submitted_at,confirmed_at").in("strategy_id",ids).order("report_date",{ascending:false}).limit(60);reports=data||[];}
 return NextResponse.json({user:p,profile,strategies:strategies||[],reports});
}