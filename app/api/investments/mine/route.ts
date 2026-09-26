import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const [{data:investments,error:ierr},{data:redemptions,error:rerr}]=await Promise.all([
  s.from("zynth_investments").select("id,principal,principal_remaining,units,entry_nav,current_value,status,invested_at,created_at,strategy_id,zynth_strategies(name,nav,minimum_investment,maximum_investment)").eq("user_id",user.id).order("created_at",{ascending:false}),
  s.from("zynth_redemption_requests").select("id,investment_id,reference,gross_amount,fee_amount,net_amount,status,requested_at,release_at,fee_pct,zynth_strategies(name)").eq("user_id",user.id).order("requested_at",{ascending:false}).limit(20)
 ]);
 if(ierr)return NextResponse.json({error:ierr.message},{status:400}); if(rerr)return NextResponse.json({error:rerr.message},{status:400});
 return NextResponse.json({investments:investments||[],redemptions:redemptions||[]});
}
