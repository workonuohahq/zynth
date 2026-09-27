import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function POST(req:Request){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>({}));
  const endpoint=String(body.endpoint||"");
  const p256dh=String(body.keys?.p256dh||"");
  const auth=String(body.keys?.auth||"");
  if(!endpoint.startsWith("https://")||endpoint.length>2048||!p256dh||!auth||p256dh.length>512||auth.length>512)return NextResponse.json({error:"Invalid push subscription."},{status:400});
  const {error}=await supabase.from("zynth_push_subscriptions").upsert({user_id:user.id,endpoint,p256dh,auth,user_agent:String(body.userAgent||"").slice(0,500),last_seen_at:new Date().toISOString(),revoked_at:null},{onConflict:"user_id,endpoint"});
  if(error)return NextResponse.json({error:"Unable to save push subscription."},{status:400});
  await supabase.from("zynth_notification_preferences").upsert({user_id:user.id,push_enabled:true,updated_at:new Date().toISOString()},{onConflict:"user_id",ignoreDuplicates:true});
  return NextResponse.json({ok:true});
}
