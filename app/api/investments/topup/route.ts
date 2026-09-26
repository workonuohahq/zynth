import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function POST(req:Request){
 try{
  const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const b=await req.json().catch(()=>({})); const investmentId=String(b.investmentId||""); const amount=Number(b.amount);
  if(!investmentId||!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"Enter a valid top-up amount."},{status:400});
  const {data,error}=await s.rpc("zynth_create_topup",{p_user_id:user.id,p_investment_id:investmentId,p_amount:amount});
  if(error)return NextResponse.json({error:error.message,code:error.message},{status:400});
  return NextResponse.json(data);
 }catch{return NextResponse.json({error:"Unable to top up investment."},{status:500})}
}