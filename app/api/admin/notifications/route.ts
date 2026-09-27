import {NextResponse} from "next/server";
import {getAdminContext} from "@/lib/admin/auth";
export const dynamic="force-dynamic";
export async function GET(req:Request){
  const {supabase:s,user}=await getAdminContext();
  if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
  const {searchParams}=new URL(req.url);
  const limit=Math.max(1,Math.min(Number(searchParams.get("limit")||12),50));
  const {data,error}=await s.from("notifications").select("id,title,body,type,read_at,created_at,metadata").eq("user_id",user.id).order("created_at",{ascending:false}).limit(limit);
  if(error)return NextResponse.json({error:error.message},{status:400});
  const {count:unreadCount,error:countError}=await s.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",user.id).is("read_at",null);
  if(countError)return NextResponse.json({error:countError.message},{status:400});
  const unread=(data||[]).filter((n:any)=>!n.read_at);
  const attention=unread.filter((n:any)=>["attention","critical"].includes(String(n.metadata?.priority||"normal"))).length;
  return NextResponse.json({notifications:data||[],unread_count:unreadCount||0,attention_count:attention});
}
export async function POST(req:Request){
  const {supabase:s,user}=await getAdminContext();
  if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
  const body=await req.json().catch(()=>({}));
  const id=body.id?String(body.id):"";
  if(body.all===true){
    const {error}=await s.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).is("read_at",null);
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }
  if(!id)return NextResponse.json({error:"Notification id is required."},{status:400});
  const {data,error}=await s.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id).select("id").maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:!!data});
}
