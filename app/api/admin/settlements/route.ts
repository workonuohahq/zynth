import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { decryptMt5Secret } from "@/lib/mt5-credentials";
async function auth(){ return getAdminContext(); }
export async function GET(){const {supabase,user}=await auth();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});const [q,h]=await Promise.all([supabase.rpc("zynth_admin_report_queue"),supabase.rpc("zynth_admin_settlement_history",{p_admin_id:user.id})]);if(q.error)return NextResponse.json({error:q.error.message},{status:400});if(h.error)return NextResponse.json({error:h.error.message},{status:400});return NextResponse.json({reports:q.data||[],history:h.data||[]});}
export async function POST(req:Request){const {supabase,user}=await auth();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});const b=await req.json().catch(()=>({}));const action=String(b.action||"");let data,error;if(action==="mt5_credentials"){
  const reportId=String(b.reportId||"");
  const {data:report,error:reportError}=await supabase.from("zynth_daily_reports").select("id,trader_id,status").eq("id",reportId).maybeSingle();
  if(reportError||!report)return NextResponse.json({error:reportError?.message||"Report not found."},{status:404});
  if(report.status!=="pending")return NextResponse.json({error:"Settlement report is no longer pending."},{status:400});
  const {data:mt5Row,error:mt5Error}=await supabase.from("zynth_trader_mt5_credentials").select("mt5_login,mt5_server,investor_password_ciphertext,status").eq("user_id",report.trader_id).maybeSingle();
  if(mt5Error||!mt5Row)return NextResponse.json({error:mt5Error?.message||"MT5 credentials not found."},{status:404});
  let investorPassword="";
  try{investorPassword=decryptMt5Secret(mt5Row.investor_password_ciphertext)}catch{return NextResponse.json({error:"MT5 credential decryption failed."},{status:500});}
  await supabase.from("audit_logs").insert({actor_user_id:user.id,action:"settlement_mt5_credentials_accessed",target_type:"settlement_report",target_id:reportId,metadata:{trader_id:report.trader_id,mt5_status:mt5Row.status}});
  return NextResponse.json({login:mt5Row.mt5_login,server:mt5Row.mt5_server,investor_password:investorPassword,status:mt5Row.status});
}
if(action==="preview")({data,error}=await supabase.rpc("zynth_admin_settlement_preview",{p_report_id:String(b.reportId),p_admin_id:user.id}));else if(action==="confirm")({data,error}=await supabase.rpc("zynth_admin_settle_report",{p_report_id:String(b.reportId),p_admin_id:user.id}));else if(action==="reject")({data,error}=await supabase.rpc("zynth_admin_reject_report",{p_report_id:String(b.reportId),p_reason:String(b.reason||"Report rejected"),p_admin_id:user.id}));else if(action==="reverse"){({data,error}=await supabase.rpc("zynth_admin_reverse_settlement",{p_settlement_id:String(b.settlementId),p_admin_id:user.id,p_reason:String(b.reason||"Settlement correction requested")}));}else return NextResponse.json({error:"Unknown settlement action."},{status:400});if(error)return NextResponse.json({error:error.message},{status:400});
if(action==="preview" && data){
  const preview:any=data;
  const traderId=preview?.trader?.id;
  if(traderId){
    const {data:mt5Row,error:mt5Error}=await supabase.from("zynth_trader_mt5_credentials").select("mt5_login,mt5_server,status,verified_at,submitted_at").eq("user_id",traderId).maybeSingle();
    if(mt5Error)return NextResponse.json({error:mt5Error.message},{status:400});
    preview.mt5=mt5Row?{login:mt5Row.mt5_login,server:mt5Row.mt5_server,status:mt5Row.status,submitted_at:mt5Row.submitted_at,verified_at:mt5Row.verified_at}:null;
    if(mt5Row){await supabase.from("audit_logs").insert({actor_user_id:user.id,action:"settlement_mt5_summary_viewed",target_type:"settlement_report",target_id:String(b.reportId),metadata:{trader_id:traderId,mt5_status:mt5Row.status}});}
  }
}
return NextResponse.json(data);}
