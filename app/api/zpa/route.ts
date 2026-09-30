import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await supabase.rpc("zynth_zpa_dashboard",{p_user_id:user.id});
  if(error)return NextResponse.json({error:error.message},{status:403});
  return NextResponse.json(data);
}

export async function POST(req:Request){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>({}));
  const code=String(body.code||"").trim();
  if(!code)return NextResponse.json({error:"ZPA code is required."},{status:400});
  const {data,error}=await supabase.rpc("zynth_zpa_claim_code",{p_user_id:user.id,p_code:code});
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json(data);
}
