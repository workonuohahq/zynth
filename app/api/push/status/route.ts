import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export async function GET(req:Request){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

  const endpoint=new URL(req.url).searchParams.get("endpoint")||"";

  if(endpoint){
    if(!endpoint.startsWith("https://")||endpoint.length>2048)
      return NextResponse.json({active:false},{status:400});
    const {data,error}=await supabase
      .from("zynth_push_subscriptions")
      .select("id")
      .eq("user_id",user.id)
      .eq("endpoint",endpoint)
      .is("revoked_at",null)
      .maybeSingle();
    if(error)return NextResponse.json({error:"Unable to check push subscription."},{status:400});
    return NextResponse.json({active:Boolean(data),serverCheckedAt:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store, max-age=0"}});
  }

  const {data,error}=await supabase
    .from("zynth_push_subscriptions")
    .select("id,endpoint,last_seen_at")
    .eq("user_id",user.id)
    .is("revoked_at",null)
    .limit(20);

  if(error)return NextResponse.json({error:"Unable to check push subscription."},{status:400});
  return NextResponse.json(
    {active:Boolean(data?.length),count:data?.length||0,serverCheckedAt:new Date().toISOString()},
    {headers:{"Cache-Control":"private, no-store, max-age=0"}}
  );
}
