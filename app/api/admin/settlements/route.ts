import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function auth(){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {supabase,user:null};
 const {data:p}=await supabase.from("users").select("role").eq("id",user.id).single();
 if(p?.role!=="admin")return {supabase,user:null};
 return {supabase,user};
}
export async function GET(){
 const {supabase,user}=await auth();
 if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const {data,error}=await supabase.rpc("zynth_admin_report_queue");
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({reports:data||[]});
}
export async function POST(req:Request){
 const {supabase,user}=await auth();
 if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const b=await req.json().catch(()=>({}));
 const action=String(b.action||"");
 let data,error;
 if(action==="preview") ({data,error}=await supabase.rpc("zynth_admin_settlement_preview",{p_report_id:String(b.reportId),p_admin_id:user.id}));
 else if(action==="confirm") ({data,error}=await supabase.rpc("zynth_admin_settle_report",{p_report_id:String(b.reportId),p_admin_id:user.id}));
 else if(action==="reject") ({data,error}=await supabase.rpc("zynth_admin_reject_report",{p_report_id:String(b.reportId),p_reason:String(b.reason||"Report rejected"),p_admin_id:user.id}));
 else return NextResponse.json({error:"Unknown settlement action."},{status:400});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json(data);
}