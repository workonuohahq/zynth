import {NextResponse} from "next/server";import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
const [{data:rule},{data:ack},{data:actions}]=await Promise.all([
 s.from("zynth_trader_rule_documents").select("id,version,title,content,requires_reacknowledgement,published_at").eq("status","published").maybeSingle(),
 s.from("zynth_trader_rule_acknowledgements").select("document_id,acknowledged_at").eq("trader_id",user.id),
 s.from("zynth_trader_disciplinary_actions").select("id,action_type,warning_number,severity,reason,details,status,created_at").eq("trader_id",user.id).order("created_at",{ascending:false})
]);if(!rule)return NextResponse.json({rule:null,acknowledged:false,actions:actions||[]});
const acknowledged=(ack||[]).some((x:any)=>x.document_id===rule.id);
return NextResponse.json({rule,acknowledged,acknowledgedAt:(ack||[]).find((x:any)=>x.document_id===rule.id)?.acknowledged_at||null,actions:actions||[]},{headers:{"Cache-Control":"private, no-store"}})}
