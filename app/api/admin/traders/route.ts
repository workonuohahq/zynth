export async function GET(req:Request){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const requestedUserId=new URL(req.url).searchParams.get("userId");
 if(requestedUserId){
  const {data:commandData,error:commandError}=await s.rpc("zynth_admin_trader_command_center",{p_admin_id:user.id});
  if(commandError)throw commandError;
  const command=commandData||{};
  const traderRows=Array.isArray(command.traders)?command.traders:[];
  const userRows=Array.isArray(command.users)?command.users:[];
  const trader=traderRows.find((x:any)=>x.id===requestedUserId)||null;
  const userRow=userRows.find((x:any)=>x.id===requestedUserId)||null;
  const {data:mt5Row,error:mt5Error}=await s.from("zynth_trader_mt5_credentials").select("mt5_login,mt5_server,investor_password_ciphertext,status,submitted_at,verified_at,rejection_reason,change_requested,change_requested_at").eq("user_id",requestedUserId).maybeSingle();
  if(mt5Error)return NextResponse.json({error:mt5Error.message},{status:400});
  if(!trader&&!userRow&&!mt5Row)return NextResponse.json({error:"User profile not found."},{status:404});
  let investorPassword="";if(mt5Row?.investor_password_ciphertext){try{investorPassword=decryptMt5Secret(mt5Row.investor_password_ciphertext)}catch{investorPassword=""}}
  const accountType=trader?"trader":"investor";
  return NextResponse.json({
   profile:{
    id:requestedUserId,user_id:requestedUserId,
    email:userRow?.email||trader?.email||null,
    full_name:userRow?.full_name||trader?.full_name||null,
    display_name:trader?.display_name||userRow?.full_name||userRow?.email?.split("@")[0]||"User",
    role:userRow?.role||trader?.role||"user",
    account_type:accountType,
    account_status:userRow?.account_status||trader?.account_status||null,
    created_at:userRow?.created_at||trader?.created_at||null,
    ...(trader?.profile||{})
   },
   trader:trader||null,
   credentials:mt5Row?{mt5Login:mt5Row.mt5_login,mt5Server:mt5Row.mt5_server,investorPassword,status:mt5Row.status,submittedAt:mt5Row.submitted_at,verifiedAt:mt5Row.verified_at,rejectionReason:mt5Row.rejection_reason,changeRequested:mt5Row.change_requested,changeRequestedAt:mt5Row.change_requested_at}:null
  });
 }
 const {data,error}=await s.rpc("zynth_admin_trader_command_center",{p_admin_id:user.id});
 if(error)throw error;const payload=data||{};
 let pendingMt5:any[]=[];let pendingMt5Error:any=null;
 try{
  const result=await s.from("zynth_trader_mt5_credentials").select("user_id,mt5_login,mt5_server,status,submitted_at,change_requested,change_requested_at").eq("status","pending").order("submitted_at",{ascending:true});
  pendingMt5=result.data||[];pendingMt5Error=result.error||null;
 }catch(error){pendingMt5Error=error;}
 if(pendingMt5Error)console.error("MT5 verification queue unavailable; preserving trader register:",pendingMt5Error);
 const pendingIds=(pendingMt5||[]).map((x:any)=>x.user_id);
 const traderRows=Array.isArray(payload.traders)?payload.traders:[];
 const userRows=Array.isArray(payload.users)?payload.users:[];
 const enrichedTraders=traderRows.map((t:any)=>({...t,mt5:t.mt5||null}));
 const traderMap=new Map(traderRows.map((t:any)=>[t.id,t]));
 const userMap=new Map(userRows.map((u:any)=>[u.id,u]));
 const enrichedPending=(pendingMt5||[]).map((m:any)=>({
  ...m,
  user:userMap.get(m.user_id)||traderMap.get(m.user_id)||null,
  profile:(traderMap.get(m.user_id) as any)?.profile||null
 }));
 const {data:reportSettings}=await s.from("system_settings").select("trader_report_start_time,trader_report_end_time").limit(1).maybeSingle();
 return NextResponse.json({
  traders:enrichedTraders,
  users:Array.isArray(payload.users)?payload.users:[],
  mt5_pending_count:pendingMt5?.length||0,
  mt5_pending:enrichedPending,
  mt5_pending_user_ids:pendingIds,
  reporting_settings:reportSettings||{trader_report_start_time:"06:00:00",trader_report_end_time:"23:00:00"}
 });
 }catch(e:any){console.error(e);return NextResponse.json({error:"Unable to load trader operations."},{status:500});}}

import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";import {decryptMt5Secret} from "@/lib/mt5-credentials";
async function admin(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return {s,user:null};const {data:p}=await s.from("users").select("role").eq("id",user.id).single();return p?.role==="admin"?{s,user}:{s,user:null};}
export async function POST(req:Request){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});const b=await req.json();
 if(["verify_mt5","reject_mt5"].includes(b.action)){
  const userId=String(b.userId||"");if(!userId)return NextResponse.json({error:"Trader user is required."},{status:400});
  const {data:current,error:currentError}=await s.from("zynth_trader_mt5_credentials").select("*").eq("user_id",userId).maybeSingle();
  if(currentError||!current)return NextResponse.json({error:currentError?.message||"MT5 submission not found."},{status:404});
  const isVerify=b.action==="verify_mt5";
  const patch:any={status:isVerify?"verified":"rejected",verified_at:isVerify?new Date().toISOString():null,verified_by:isVerify?user.id:null,rejection_reason:isVerify?null:String(b.reason||"MT5 details were not approved by operations."),updated_at:new Date().toISOString()};
  if(isVerify){patch.previous_mt5_login=null;patch.previous_mt5_server=null;patch.previous_investor_password_ciphertext=null;patch.change_requested=false;patch.change_requested_at=null;}
  else if(current.previous_mt5_login&&current.previous_mt5_server&&current.previous_investor_password_ciphertext){patch.mt5_login=current.previous_mt5_login;patch.mt5_server=current.previous_mt5_server;patch.investor_password_ciphertext=current.previous_investor_password_ciphertext;patch.status="verified";patch.verified_at=current.verified_at;patch.verified_by=current.verified_by;patch.change_requested=false;patch.change_requested_at=null;}
  const {data,error}=await s.from("zynth_trader_mt5_credentials").update(patch).eq("user_id",userId).select("user_id,status,verified_at,rejection_reason,change_requested").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  await s.from("audit_logs").insert({actor_user_id:user.id,action:"trader_mt5_"+(isVerify?"verified":"rejected"),target_type:"trader",target_id:userId,metadata:{reason:b.reason||null,change_request:Boolean(current.change_requested)}});
  return NextResponse.json({success:true,credentials:data});
}
if(b.action==="save_reporting_settings"){
  const start=String(b.startTime||"").slice(0,8),end=String(b.endTime||"").slice(0,8);
  if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(end))return NextResponse.json({error:"Enter valid reporting times."},{status:400});
  if(start.slice(0,5)===end.slice(0,5))return NextResponse.json({error:"Start and end time cannot be the same."},{status:400});
  const {data,error}=await s.from("system_settings").update({trader_report_start_time:start.slice(0,5)+":00",trader_report_end_time:end.slice(0,5)+":00",updated_at:new Date().toISOString()}).eq("id","00000000-0000-0000-0000-000000000001").select("trader_report_start_time,trader_report_end_time").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  await s.from("audit_logs").insert({actor_user_id:user.id,action:"trader.reporting_window_updated",target_type:"system_settings",target_id:"00000000-0000-0000-0000-000000000001",metadata:{start_time:data.trader_report_start_time,end_time:data.trader_report_end_time}});
  return NextResponse.json({success:true,reporting_settings:data});
}
if(b.action==="promote"){const {data,error}=await s.rpc("zynth_admin_promote_trader",{p_user_id:b.userId,p_admin_id:user.id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 return NextResponse.json({error:"Unsupported action."},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||"Operation failed."},{status:500});}}