import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(req:Request){
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data:p}=await supabase.from("users").select("role").eq("id",user.id).single();if(p?.role!=="admin")return NextResponse.json({error:"Administrator access required."},{status:403});
 const b=await req.json().catch(()=>({}));
 const {data,error}=await supabase.rpc("zynth_admin_set_strategy",{p_admin_id:user.id,p_strategy_id:b.strategyId||null,p_name:String(b.name||""),p_description:String(b.description||""),p_trader_id:b.traderId||null,p_starting_balance:Number(b.startingBalance||0),p_minimum_investment:Number(b.minimumInvestment||0),p_maximum_investment:b.maximumInvestment?Number(b.maximumInvestment):null,p_status:String(b.status||"active")});
 if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);
}