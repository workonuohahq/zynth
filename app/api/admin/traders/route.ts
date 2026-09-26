export async function GET(req:Request){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const requestedUserId=new URL(req.url).searchParams.get("userId");
 if(requestedUserId){
  const [{data:userRow,error:userError},{data:traderProfile,error:profileError},{data:application,error:applicationError},{data:mt5Row,error:mt5Error}]=await Promise.all([
   s.from("users").select("id,email,full_name,role,kyc_verified,account_status,created_at").eq("id",requestedUserId).maybeSingle(),
   s.from("zynth_trader_profiles").select("*").eq("user_id",requestedUserId).maybeSingle(),
   s.from("zynth_trader_applications").select("*").eq("user_id",requestedUserId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
   s.from("zynth_trader_mt5_credentials").select("mt5_login,mt5_server,investor_password_ciphertext,status,submitted_at,verified_at,rejection_reason,change_requested,change_requested_at").eq("user_id",requestedUserId).maybeSingle()
  ]);
  if(userError)return NextResponse.json({error:userError.message},{status:400});
  if(profileError)return NextResponse.json({error:profileError.message},{status:400});
  if(applicationError)return NextResponse.json({error:applicationError.message},{status:400});
  if(mt5Error)return NextResponse.json({error:mt5Error.message},{status:400});
  if(!userRow)return NextResponse.json({error:"User profile not found."},{status:404});
  let investorPassword="";if(mt5Row?.investor_password_ciphertext){try{investorPassword=decryptMt5Secret(mt5Row.investor_password_ciphertext)}catch{investorPassword=""}}
  const profile=traderProfile||application||null;
  const accountType=traderProfile?"trader":(userRow.role==="trader"||application?"trader":"investor");
  return NextResponse.json({
   profile:{id:userRow.id,user_id:userRow.id,email:userRow.email,full_name:userRow.full_name,display_name:profile?.display_name||userRow.full_name||userRow.email?.split("@")[0]||"User",role:userRow.role,account_type:accountType,kyc_verified:userRow.kyc_verified,account_status:userRow.account_status,created_at:userRow.created_at,...(profile||{})},
   trader:traderProfile||null,
   application:application||null,
   credentials:mt5Row?{mt5Login:mt5Row.mt5_login,mt5Server:mt5Row.mt5_server,investorPassword,status:mt5Row.status,submittedAt:mt5Row.submitted_at,verifiedAt:mt5Row.verified_at,rejectionReason:mt5Row.rejection_reason,changeRequested:mt5Row.change_requested,changeRequestedAt:mt5Row.change_requested_at}:null
  });
 }
 const {data,error}=await s.rpc("zynth_admin_trader_command_center",{p_admin_id:user.id});
 if(error)throw error;const payload=data||{};
 const {data:pendingMt5,error:pendingMt5Error}=await s.from("zynth_trader_mt5_credentials").select("user_id,mt5_login,mt5_server,status,submitted_at,change_requested,change_requested_at").eq("status","pending").order("submitted_at",{ascending:true});
 if(pendingMt5Error)throw pendingMt5Error;
 const pendingIds=(pendingMt5||[]).map((x:any)=>x.user_id);
 const traderRows=Array.isArray(payload.traders)?payload.traders:[];
 const enrichedTraders=traderRows.map((t:any)=>({...t,mt5:t.mt5||null}));
 return NextResponse.json({
  applications:Array.isArray(payload.applications)?payload.applications:[],
  traders:enrichedTraders,
  users:Array.isArray(payload.users)?payload.users:[],
  mt5_pending_count:pendingMt5?.length||0,
  mt5_pending:pendingMt5||[],
  mt5_pending_user_ids:pendingIds
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
if(b.action==="promote"){const {data,error}=await s.rpc("zynth_admin_promote_trader",{p_user_id:b.userId,p_admin_id:user.id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 if(["approve","reject","more_info","under_review"].includes(b.action)){const {data,error}=await s.rpc("zynth_admin_review_trader_application",{p_application_id:b.applicationId,p_admin_id:user.id,p_action:b.action,p_admin_note:String(b.note||"")});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 return NextResponse.json({error:"Unsupported action."},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||"Operation failed."},{status:500});}}