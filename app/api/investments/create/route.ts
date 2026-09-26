import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>({}));
  const amount=Number(body.amount);
  const strategyId=String(body.strategyId||"");
  if(!strategyId || !Number.isFinite(amount) || amount<=0) return NextResponse.json({error:"Enter a valid investment amount."},{status:400});
  const {data,error}=await supabase.rpc("zynth_create_investment",{p_user_id:user.id,p_strategy_id:strategyId,p_amount:amount});
  if(error) return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json(data);
}