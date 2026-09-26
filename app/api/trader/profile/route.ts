import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
const allowed=["display_name","bio","country","years_experience","markets","trading_style","holding_period","risk_management","typical_risk_pct","historical_drawdown_pct","broker_platform","track_record_url"];
export async function PATCH(req:Request){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data:u}=await s.from("users").select("role").eq("id",user.id).single();if(u?.role!=="trader")return NextResponse.json({error:"Trader access required."},{status:403});
 const body=await req.json();const patch:any={updated_at:new Date().toISOString()};
 for(const key of allowed)if(Object.prototype.hasOwnProperty.call(body,key))patch[key]=body[key];
 if(patch.years_experience!==undefined)patch.years_experience=Math.max(0,Math.min(80,Number(patch.years_experience)||0));
 if(patch.typical_risk_pct!==undefined)patch.typical_risk_pct=Math.max(0,Math.min(100,Number(patch.typical_risk_pct)||0));
 if(patch.historical_drawdown_pct!==undefined)patch.historical_drawdown_pct=Math.max(0,Math.min(100,Number(patch.historical_drawdown_pct)||0));
 const {data,error}=await s.from("zynth_trader_profiles").update(patch).eq("user_id",user.id).select("*").single();
 if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({profile:data});
}