import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data,error}=await s.from("zynth_redemption_requests").select("id,investment_id,strategy_id,reference,requested_amount,requested_units,nav,gross_amount,fee_pct,fee_amount,net_amount,status,requested_at,approved_at,processing_at,release_at,released_at,failure_reason,zynth_strategies(name)").eq("user_id",user.id).order("requested_at",{ascending:false}).limit(20);
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({redemptions:data||[]});
}
export async function POST(req:Request){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const b=await req.json().catch(()=>({})); const investmentId=String(b.investmentId||""); const amount=Number(b.amount);
 if(!investmentId||!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"Enter a valid redemption amount."},{status:400});
 const {data,error}=await s.rpc("zynth_request_redemption",{p_user_id:user.id,p_investment_id:investmentId,p_amount:amount});
 if(error)return NextResponse.json({error:error.message,code:error.message},{status:400});
 return NextResponse.json(data);
}