import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function POST(req:Request){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const b=await req.json().catch(()=>({})); const redemptionId=String(b.redemptionId||"");
 if(!redemptionId)return NextResponse.json({error:"Redemption is required."},{status:400});
 const {data,error}=await s.rpc("zynth_cancel_redemption",{p_user_id:user.id,p_redemption_id:redemptionId});
 if(error)return NextResponse.json({error:error.message,code:error.message},{status:400});
 return NextResponse.json(data);
}
