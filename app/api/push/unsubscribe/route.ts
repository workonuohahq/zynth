import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function POST(req:Request){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>({}));
  const endpoint=String(body.endpoint||"");
  if(!endpoint)return NextResponse.json({error:"Endpoint required."},{status:400});
  const {error}=await supabase.from("zynth_push_subscriptions").update({revoked_at:new Date().toISOString()}).eq("user_id",user.id).eq("endpoint",endpoint);
  if(error)return NextResponse.json({error:"Unable to disable push notifications."},{status:400});
  return NextResponse.json({ok:true});
}
