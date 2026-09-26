import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";import {decryptMt5Secret} from "@/lib/mt5-credentials";
async function admin(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return {s,user:null};const {data:p}=await s.from("users").select("role").eq("id",user.id).single();return p?.role==="admin"?{s,user}:{s,user:null};}
export async function POST(req:Request){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});const b=await req.json();
 if(["verify_mt5","reject_mt5"].includes(b.action)){
  const userId=String(b.userId||""); if(!userId)return NextResponse.json({error:"Trader user is required."},{status:400});
  const status=b.action==="verify_mt5"?"verified":"rejected";
  const {data,error}=await s.from("zynth_trader_mt5_credentials").update({status,verified_at:status==="verified"?new Date().toISOString():null,verified_by:status==="verified"?user.id:null,rejection_reason:status==="rejected"?String(b.reason||"MT5 details were not approved by operations."):null,updated_at:new Date().toISOString()}).eq("user_id",userId).select("user_id,status,verified_at,rejection_reason").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  await s.from("audit_logs").insert({actor_user_id:user.id,action:"trader_mt5_"+status,target_type:"trader",target_id:userId,metadata:{reason:b.reason||null}});
  return NextResponse.json({success:true,credentials:data});
}
if(b.action==="promote"){const {data,error}=await s.rpc("zynth_admin_promote_trader",{p_user_id:b.userId,p_admin_id:user.id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 if(["approve","reject","more_info","under_review"].includes(b.action)){const {data,error}=await s.rpc("zynth_admin_review_trader_application",{p_application_id:b.applicationId,p_admin_id:user.id,p_action:b.action,p_admin_note:String(b.note||"")});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 return NextResponse.json({error:"Unsupported action."},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||"Operation failed."},{status:500});}}