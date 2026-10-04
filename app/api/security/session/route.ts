import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function hash(value:string){return createHash("sha256").update(value).digest("hex");}
function header(req:Request,name:string){return req.headers.get(name)||"";}
function uaInfo(ua:string){
 const lower=ua.toLowerCase();
 return {
  deviceType:/mobile|android|iphone|ipad/i.test(ua)?"mobile":"desktop",
  os:lower.includes("android")?"Android":lower.includes("iphone")||lower.includes("ipad")?"iOS":lower.includes("windows")?"Windows":lower.includes("mac os")?"macOS":lower.includes("linux")?"Linux":"Unknown",
  browser:lower.includes("edg/")?"Edge":lower.includes("chrome/")?"Chrome":lower.includes("firefox/")?"Firefox":lower.includes("safari/")&&!lower.includes("chrome/")?"Safari":"Browser"
 };
}
export async function POST(req:Request){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const body=await req.json().catch(()=>({})); const action=String(body.action||"register");
 const ua=header(req,"user-agent"); const info=uaInfo(ua);
 const ip=header(req,"x-forwarded-for").split(",")[0].trim()||header(req,"x-real-ip");
 const ipHash=ip?hash(ip):null;
 const country=header(req,"x-vercel-ip-country")||null, region=header(req,"x-vercel-ip-country-region")||null, city=header(req,"x-vercel-ip-city")||null;
 if(action==="register"){
  const deviceKey=String(body.deviceKey||""); if(deviceKey.length<20)return NextResponse.json({error:"Invalid device identity."},{status:400});
  const {data:deviceId,error:deviceError}=await supabase.rpc("zynth_security_register_device",{p_device_key:deviceKey,p_device_name:info.os+" device",p_device_type:info.deviceType,p_os_name:info.os,p_os_version:null,p_browser_name:info.browser,p_browser_version:null,p_app_mode:body.appMode||"web",p_user_agent:ua,p_ip_hash:ipHash,p_ip_country:country,p_ip_region:region,p_ip_city:city});
  if(deviceError)return NextResponse.json({error:"Unable to register this device."},{status:500});
  const sessionKey=String(body.sessionKey||randomBytes(32).toString("hex"));
  const family=String(body.sessionFamily||randomBytes(24).toString("hex"));
  const {data:sessionId,error:sessionError}=await supabase.rpc("zynth_security_register_session",{p_session_key:sessionKey,p_device_id:deviceId,p_user_agent:ua,p_ip_hash:ipHash,p_ip_country:country,p_ip_region:region,p_ip_city:city,p_session_family:family,p_expires_at:new Date(Date.now()+2592000000).toISOString()});
  if(sessionError)return NextResponse.json({error:"Unable to register this session."},{status:500});
  return NextResponse.json({ok:true,deviceId,sessionId,sessionKey});
 }
 if(action==="heartbeat"){
  const {data,error}=await supabase.rpc("zynth_security_heartbeat",{p_session_key:String(body.sessionKey||"")});
  return NextResponse.json({active:!error&&data===true});
 }
 if(action==="revoke"){
  const {data,error}=await supabase.rpc("zynth_security_revoke_session",{p_session_id:String(body.sessionId||"")});
  if(error)return NextResponse.json({error:"Unable to revoke session."},{status:400}); return NextResponse.json({ok:data===true});
 }
 if(action==="revoke_all"){
  const {data,error}=await supabase.rpc("zynth_security_revoke_all_other_sessions",{p_current_session_id:String(body.currentSessionId||"")});
  if(error)return NextResponse.json({error:"Unable to revoke other sessions."},{status:400}); return NextResponse.json({ok:true,count:Number(data||0)});
 }
 return NextResponse.json({error:"Unsupported action."},{status:400});
}