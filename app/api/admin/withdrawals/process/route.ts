import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
 try {
  const body=await request.json(); const withdrawalId=String(body?.withdrawalId||""); const action=String(body?.action||""); const reason=typeof body?.reason==="string"?body.reason:null;
  if(!withdrawalId||!["review","processing","paid","reject"].includes(action))return NextResponse.json({error:"A valid withdrawal action is required."},{status:400});
  const client=await createSupabaseServerClient(); const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("process_withdrawal_action",{p_withdrawal_id:withdrawalId,p_action:action,p_admin_user_id:user.id,p_reason:reason});
  if(error)return NextResponse.json({error:error.message==="INVALID_WITHDRAWAL_TRANSITION"?"That action is not valid for the current withdrawal state.":"Unable to process withdrawal.",code:error.message},{status:400});
  return NextResponse.json({ok:true,result:data});
 }catch(error){console.error(error);return NextResponse.json({error:"Unable to process withdrawal."},{status:500});}
}