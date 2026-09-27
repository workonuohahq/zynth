import {NextResponse} from "next/server";import {getAdminContext} from "@/lib/admin/auth";
const json=(x:any,s=200)=>NextResponse.json(x,{status:s});
export async function GET(){const {supabase,user}=await getAdminContext();if(!user)return json({error:"Admin access required"},403);
const [{data:rule},{data:actions}]=await Promise.all([
 supabase.from("zynth_trader_rule_documents").select("*").order("version",{ascending:false}),
 supabase.from("zynth_trader_disciplinary_actions").select("*").order("created_at",{ascending:false})
]);
const {data:traders}=await supabase.from("zynth_trader_profiles").select("user_id,status,display_name").order("display_name");
const {data:users}=await supabase.from("users").select("id,email,full_name,account_status");
const {data:strategies}=await supabase.from("zynth_strategies").select("id,trader_id,created_at,status").in("status",["active","paused","pending_review"]);
const {data:monthReports}=await supabase.from("zynth_daily_reports").select("trader_id,strategy_id,report_cycle_date,report_date,status").gte("report_cycle_date",new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1)).toISOString().slice(0,10));
const now=new Date();const y=now.getUTCFullYear(),m=now.getUTCMonth(),monthStart=new Date(Date.UTC(y,m,1)),today=new Date(Date.UTC(y,m,now.getUTCDate()));
const weekdays=(from:Date,to:Date)=>{let n=0,d=new Date(from);for(;d<=to;d.setUTCDate(d.getUTCDate()+1)){const day=d.getUTCDay();if(day!==0&&day!==6)n++;}return n};
const merged=(traders||[]).map((t:any)=>{const u=(users||[]).find((x:any)=>x.id===t.user_id);const a=(actions||[]).filter((x:any)=>x.trader_id===t.user_id&&x.action_type==="warning"&&x.status==="active");const ts=(strategies||[]).filter((x:any)=>x.trader_id===t.user_id);let required=0;for(const st of ts){const start=new Date(Math.max(new Date(st.created_at).getTime(),monthStart.getTime()));required+=weekdays(start,today)}const submitted=new Set((monthReports||[]).filter((r:any)=>r.trader_id===t.user_id&&r.status!=="rejected").map((r:any)=>r.strategy_id+"|"+(r.report_cycle_date||r.report_date))).size;const expected=Math.max(0,required);const missed=Math.max(0,expected-submitted);return {...t,email:u?.email,full_name:u?.full_name,account_status:u?.account_status,warning_count:a.length,missed_reports:missed}});
const {data:ack}=await supabase.from("zynth_trader_rule_acknowledgements").select("trader_id,document_id,acknowledged_at");
return json({rules:rule||[],actions:actions||[],traders:merged,acknowledgements:ack||[]})}
export async function POST(req:Request){const {supabase,user}=await getAdminContext();if(!user)return json({error:"Admin access required"},403);let body:any;try{body=await req.json()}catch{return json({error:"Invalid request"},400)}
if(body.action==="publish_rule"){const content=String(body.content||"").trim();if(!content)return json({error:"Rule content is required"},400);
const {data:max}=await supabase.from("zynth_trader_rule_documents").select("version").order("version",{ascending:false}).limit(1).maybeSingle();const version=Number(max?.version||0)+1;
await supabase.from("zynth_trader_rule_documents").update({status:"archived",updated_at:new Date().toISOString()}).eq("status","published");
const {data, error}=await supabase.from("zynth_trader_rule_documents").insert({version,title:String(body.title||"ZYNTH Trader Rules & Standards"),content,requires_reacknowledgement:Boolean(body.requiresReacknowledgement),status:"published",published_at:new Date().toISOString(),created_by:user.id}).select().single();
if(error)return json({error:error.message},400);return json({rule:data})}
if(body.action==="save_draft"){const content=String(body.content||"").trim();if(!content)return json({error:"Rule content is required"},400);const {data:max}=await supabase.from("zynth_trader_rule_documents").select("version").order("version",{ascending:false}).limit(1).maybeSingle();const version=Number(max?.version||0)+1;const {data,error}=await supabase.from("zynth_trader_rule_documents").insert({version,title:String(body.title||"ZYNTH Trader Rules & Standards"),content,requires_reacknowledgement:Boolean(body.requiresReacknowledgement),status:"draft",created_by:user.id}).select().single();if(error)return json({error:error.message},400);return json({rule:data})}
if(body.action==="disciplinary"){const traderId=String(body.traderId||"");const type=String(body.type||"warning");if(!traderId||!["warning","suspension","termination","reinstatement","note"].includes(type))return json({error:"Invalid disciplinary action"},400);
const {data:existing}=await supabase.from("zynth_trader_disciplinary_actions").select("warning_number").eq("trader_id",traderId).eq("action_type","warning").eq("status","active").order("warning_number",{ascending:false}).limit(1).maybeSingle();
const warningNumber=type==="warning"?Number(existing?.warning_number||0)+1:null;
const {data:action,error}=await supabase.from("zynth_trader_disciplinary_actions").insert({trader_id:traderId,action_type:type,warning_number:warningNumber,severity:String(body.severity||"medium"),reason:String(body.reason||"Disciplinary action"),details:String(body.details||""),issued_by:user.id}).select().single();if(error)return json({error:error.message},400);
let terminated=false;
if(type==="warning"&&warningNumber>=3){await supabase.from("zynth_trader_disciplinary_actions").insert({trader_id:traderId,action_type:"termination",warning_number:3,severity:"critical",reason:"Third active formal warning",details:"Trader reached the three-warning termination threshold.",issued_by:user.id});await supabase.from("zynth_trader_profiles").update({status:"restricted",restricted_reason:"Terminated after three active formal warnings",updated_at:new Date().toISOString()}).eq("user_id",traderId);terminated=true}
if(type==="termination"){await supabase.from("zynth_trader_profiles").update({status:"restricted",restricted_reason:String(body.reason||"Trader terminated"),updated_at:new Date().toISOString()}).eq("user_id",traderId)}
if(type==="reinstatement"){await supabase.from("zynth_trader_profiles").update({status:"active",restricted_reason:null,updated_at:new Date().toISOString()}).eq("user_id",traderId)}
return json({action,terminated})}
return json({error:"Unknown action"},400)}
