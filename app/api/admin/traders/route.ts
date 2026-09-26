import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";
async function admin(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return {s,user:null};const {data:p}=await s.from("users").select("role").eq("id",user.id).single();return p?.role==="admin"?{s,user}:{s,user:null};}
export async function GET(){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const [{data:applications},{data:traders},{data:users}]=await Promise.all([
  s.from("zynth_trader_applications").select("*,users!zynth_trader_applications_user_id_fkey(email,full_name)").in("status",["pending","under_review","more_info"]).order("created_at",{ascending:false}),
  s.from("users").select("id,email,full_name,account_status,zynth_trader_profiles(status,display_name),zynth_strategies(id)").eq("role","trader").order("created_at",{ascending:false}),
  s.from("users").select("id,email,full_name,account_status,created_at").eq("role","user").eq("account_status","active").order("created_at",{ascending:false}).limit(50)
 ]);
 const apps=(applications||[]).map((a:any)=>({...a,email:a.users?.email||null,user_name:a.users?.full_name||null,users:undefined}));
 const ts=(traders||[]).map((t:any)=>({...t,profile_status:t.zynth_trader_profiles?.[0]?.status||t.zynth_trader_profiles?.status||"active",display_name:t.zynth_trader_profiles?.[0]?.display_name||t.zynth_trader_profiles?.display_name||t.full_name,strategy_count:Array.isArray(t.zynth_strategies)?t.zynth_strategies.length:0,zynth_trader_profiles:undefined,zynth_strategies:undefined}));
 return NextResponse.json({applications:apps,traders:ts,users:users||[]});
 }catch(e:any){console.error(e);return NextResponse.json({error:"Unable to load trader operations."},{status:500});}}
export async function POST(req:Request){try{const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});const b=await req.json();
 if(b.action==="promote"){const {data,error}=await s.rpc("zynth_admin_promote_trader",{p_user_id:b.userId,p_admin_id:user.id});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 if(["approve","reject","more_info","under_review"].includes(b.action)){const {data,error}=await s.rpc("zynth_admin_review_trader_application",{p_application_id:b.applicationId,p_admin_id:user.id,p_action:b.action,p_admin_note:String(b.note||"")});if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data);}
 return NextResponse.json({error:"Unsupported action."},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||"Operation failed."},{status:500});}}