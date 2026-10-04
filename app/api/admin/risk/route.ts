import {NextResponse} from "next/server";
import {getAdminContext} from "@/lib/admin/auth";
export async function GET(request:Request){
 try{
  const {supabase,user}=await getAdminContext(); if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
  const u=new URL(request.url);
  const [queue,rules]=await Promise.all([
   supabase.rpc("zynth_risk_admin_queue",{p_admin_id:user.id,p_classification:u.searchParams.get("classification")||null,p_status:u.searchParams.get("status")||null,p_limit:Math.min(Math.max(Number(u.searchParams.get("limit")||50),1),100)}),
   supabase.rpc("zynth_risk_admin_rules",{p_admin_id:user.id})
  ]);
  if(queue.error)throw queue.error; if(rules.error)throw rules.error;
  return NextResponse.json({...((queue.data as any)||{}),rules:rules.data||[]});
 }catch(e){console.error(e);return NextResponse.json({error:"Unable to load risk center."},{status:500})}
}
export async function PATCH(request:Request){
 try{
  const {supabase,user}=await getAdminContext(); if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
  const b=await request.json();
  if(b.action==="resolve"){
   const {data,error}=await supabase.rpc("zynth_risk_admin_resolve",{p_admin_id:user.id,p_case_id:b.caseId,p_status:String(b.status),p_action:String(b.riskAction||"MONITOR"),p_note:String(b.note||"").slice(0,1000)});
   if(error)throw error; return NextResponse.json(data||{ok:true});
  }
  if(b.action==="update_rule"){
   const {data,error}=await supabase.rpc("zynth_risk_admin_update_rule",{p_admin_id:user.id,p_rule_key:String(b.ruleKey),p_enabled:Boolean(b.enabled),p_points:Number(b.points),p_threshold_count:Number(b.thresholdCount),p_window_minutes:Number(b.windowMinutes),p_action:String(b.riskAction||"FLAG"),p_config:b.config&&typeof b.config==="object"?b.config:{}});
   if(error)throw error; return NextResponse.json(data||{ok:true});
  }
  return NextResponse.json({error:"Unsupported risk action."},{status:400});
 }catch(e){console.error(e);return NextResponse.json({error:e instanceof Error?e.message:"Risk action failed."},{status:400})}
}