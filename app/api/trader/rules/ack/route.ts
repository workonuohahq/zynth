import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function POST(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
const {data:roles}=await s.rpc("zynth_get_my_roles",{p_user_id:user.id});if(!Array.isArray(roles)||!roles.includes("trader"))return NextResponse.json({error:"Trader access required"},{status:403});
const {data:rule,error:e}=await s.from("zynth_trader_rule_documents").select("id").eq("status","published").maybeSingle();if(e||!rule)return NextResponse.json({error:"No published rules available"},{status:404});
const {error}=await s.from("zynth_trader_rule_acknowledgements").upsert({document_id:rule.id,trader_id:user.id},{onConflict:"document_id,trader_id"});if(error)return NextResponse.json({error:error.message},{status:400});
return NextResponse.json({ok:true,acknowledgedAt:new Date().toISOString()})}
