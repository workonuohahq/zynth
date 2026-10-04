import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(req:Request,{params}:{params:{id:string}}){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const period=(new URL(req.url).searchParams.get("period")||"since_inception").toLowerCase();
 const {data,error}=await s.rpc("zynth_strategy_intelligence",{p_strategy_id:params.id,p_period:period});
 if(error)return NextResponse.json({error:error.message},{status:error.message==="STRATEGY_UNAVAILABLE"?404:400});
 return NextResponse.json(data||{});
}