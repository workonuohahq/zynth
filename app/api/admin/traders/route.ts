import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";
async function admin(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return {s,user:null};const {data:p}=await s.from("users").select("role").eq("id",user.id).single();return p?.role==="admin"?{s,user}:{s,user:null};}
export async function GET(){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const {data,error}=await s.rpc("zynth_admin_trader_command_center",{p_admin_id:user.id});
 if(error) throw error;
 const payload=data||{};
 return NextResponse.json({applications:Array.isArray(payload.applications)?payload.applications:[],traders:Array.isArray(payload.traders)?payload.traders:[],users:Array.isArray(payload.users)?payload.users:[]});
 }catch(e:any){console.error(e);return NextResponse.json({error:"Unable to load trader operations."},{status:500});}}
export async function POST(req:Request){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});const b=await req.json();
 if(b.action==="promote"){const {data,error}=await s.rpc("zynth_admin_promote_trader",{p_user_id:b.userId,p_admin_id:user.id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 if(["approve","reject","more_info","under_review"].includes(b.action)){const {data,error}=await s.rpc("zynth_admin_review_trader_application",{p_application_id:b.applicationId,p_admin_id:user.id,p_action:b.action,p_admin_note:String(b.note||"")});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 return NextResponse.json({error:"Unsupported action."},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||"Operation failed."},{status:500});}}