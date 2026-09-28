import {NextResponse} from "next/server";
import {getAdminContext} from "@/lib/admin/auth";

async function admin(){return getAdminContext();}

export async function GET(req:Request){
 const {supabase:s,user}=await admin();
 if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const url=new URL(req.url),mode=url.searchParams.get("mode")||"history";
 try{
  if(mode==="preview"){
   const audience=JSON.parse(url.searchParams.get("audience")||"{}");
   const {data,error}=await s.rpc("zynth_admin_broadcast_preview",{p_admin_id:user.id,p_audience:audience});
   if(error)throw error; return NextResponse.json({preview:data});
  }
  if(mode==="recipients"){
   const audience=JSON.parse(url.searchParams.get("audience")||"{}");
   const {data,error}=await s.rpc("zynth_admin_broadcast_recipients",{p_admin_id:user.id,p_audience:audience});
   if(error)throw error; return NextResponse.json({recipients:data||[]});
  }
  if(mode==="users"){
   const {data,error}=await s.rpc("zynth_admin_broadcast_user_directory",{p_admin_id:user.id,p_query:url.searchParams.get("q")||""});
   if(error)throw error; return NextResponse.json({users:data||[]});
  }
  if(mode==="drafts"){
   const {data,error}=await s.rpc("zynth_admin_broadcast_drafts",{p_admin_id:user.id});
   if(error)throw error; return NextResponse.json({drafts:data||[]});
  }
  if(mode==="templates"){
   const {data,error}=await s.rpc("zynth_admin_broadcast_templates",{p_admin_id:user.id});
   if(error)throw error; return NextResponse.json({templates:data||[]});
  }
  const {data,error}=await s.rpc("zynth_admin_broadcast_history",{p_admin_id:user.id});
  if(error)throw error; return NextResponse.json({broadcasts:data||[]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Broadcast request failed."},{status:400});}
}

export async function POST(req:Request){
 const {supabase:s,user}=await admin();
 if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const b=await req.json().catch(()=>({})); const mode=String(b.mode||"send");
 try{
  if(mode==="draft"){
   const {data,error}=await s.rpc("zynth_admin_save_broadcast_draft",{p_admin_id:user.id,p_id:b.id||null,p_title:String(b.title||""),p_body:String(b.body||""),p_audience:b.audience||{},p_channel_in_app:b.channel_in_app!==false,p_channel_push:b.channel_push!==false,p_priority:String(b.priority||"normal"),p_action_url:b.action_url?String(b.action_url):null});
   if(error)throw error; return NextResponse.json({id:data});
  }
  if(mode==="template"){
   const {data,error}=await s.rpc("zynth_admin_save_broadcast_template",{p_admin_id:user.id,p_id:b.id||null,p_name:String(b.name||""),p_category:String(b.category||"custom"),p_title:String(b.title||""),p_body:String(b.body||""),p_priority:String(b.priority||"normal"),p_action_url:b.action_url?String(b.action_url):null});
   if(error)throw error; return NextResponse.json({id:data});
  }
  if(mode==="delete_template"){
   const {data,error}=await s.rpc("zynth_admin_delete_broadcast_template",{p_admin_id:user.id,p_id:b.id});
   if(error)throw error; return NextResponse.json({ok:data});
  }
  if(mode==="delete_draft"){
   const {data,error}=await s.rpc("zynth_admin_delete_broadcast_draft",{p_admin_id:user.id,p_id:b.id});
   if(error)throw error; return NextResponse.json({ok:data});
  }
  if(mode==="send"){
   const {data,error}=await s.rpc("zynth_admin_create_broadcast",{p_admin_id:user.id,p_title:String(b.title||""),p_body:String(b.body||""),p_audience:b.audience||{},p_channel_in_app:b.channel_in_app!==false,p_channel_push:b.channel_push!==false,p_priority:String(b.priority||"normal"),p_action_url:b.action_url?String(b.action_url):null});
   if(error)throw error; return NextResponse.json({broadcast:data});
  }
  throw new Error("Unsupported broadcast action.");
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Broadcast action failed."},{status:400});}
}