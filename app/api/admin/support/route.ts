import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
async function admin(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return{s,user:null};const {data:p}=await s.from("users").select("role,account_status").eq("id",user.id).single();return{s,user:p?.role==="admin"&&p?.account_status==="active"?user:null};}
export async function GET(req:Request){
 const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const {searchParams}=new URL(req.url);const ticketId=searchParams.get("ticket");const status=searchParams.get("status");
 let q=s.from("zynth_support_tickets").select("*,user:users!zynth_support_tickets_user_id_fkey(id,full_name,email,role,account_status,kyc_verified,main_wallet_balance,created_at)").order("updated_at",{ascending:false}).limit(100);
 if(status&&status!=="all")q=q.eq("status",status);
 const {data:tickets,error}=await q;if(error)return NextResponse.json({error:error.message},{status:400});
 if(ticketId){
  const ticket=(tickets||[]).find((x:any)=>x.id===ticketId);
  if(!ticket)return NextResponse.json({error:"Ticket not found."},{status:404});
  await s.from("zynth_support_tickets").update({admin_unread_count:0}).eq("id",ticketId);
  const {data:messages,error:me}=await s.from("zynth_support_messages").select("id,ticket_id,sender_user_id,sender_role,body,is_internal,created_at,read_at").eq("ticket_id",ticketId).order("created_at",{ascending:true});
  if(me)return NextResponse.json({error:me.message},{status:400});
  const uid=ticket.user?.id;
  const [{data:investments},{data:transactions},{data:withdrawals},{data:deposits}]=await Promise.all([
    s.from("zynth_investments").select("id,principal,current_value,status,zynth_strategies(name)").eq("user_id",uid).eq("status","active"),
    s.from("transactions").select("id,type,amount,status,created_at,reference").eq("user_id",uid).order("created_at",{ascending:false}).limit(8),
    s.from("withdrawal_requests").select("id,amount,status,created_at").eq("user_id",uid).in("status",["pending","processing"]).order("created_at",{ascending:false}).limit(5),
    s.from("deposit_requests").select("id,amount,status,created_at").eq("user_id",uid).in("status",["pending","processing"]).order("created_at",{ascending:false}).limit(5)
  ]);
  return NextResponse.json({tickets:tickets||[],ticket,messages:messages||[],context:{investments:investments||[],transactions:transactions||[],withdrawals:withdrawals||[],deposits:deposits||[]}});
 }
 return NextResponse.json({tickets:tickets||[]});
}
export async function POST(req:Request){
 const {s,user}=await admin();if(!user)return NextResponse.json({error:"Administrator access required."},{status:403});
 const b=await req.json().catch(()=>({}));const ticketId=String(b.ticketId||"");const body=String(b.body||"").trim();const action=String(b.action||"message");
 if(action==="message"){
  if(!ticketId||!body)return NextResponse.json({error:"Message cannot be empty."},{status:400});
  const {data:ticket}=await s.from("zynth_support_tickets").select("id,status").eq("id",ticketId).single();if(!ticket)return NextResponse.json({error:"Ticket not found."},{status:404});
  const {data:message,error}=await s.from("zynth_support_messages").insert({ticket_id:ticketId,sender_user_id:user.id,sender_role:"admin",body,is_internal:false}).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({message});
 }
 if(action==="internal_note"){
  if(!ticketId||!body)return NextResponse.json({error:"Note cannot be empty."},{status:400});
  const {data:message,error}=await s.from("zynth_support_messages").insert({ticket_id:ticketId,sender_user_id:user.id,sender_role:"admin",body,is_internal:true}).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({message});
 }
 if(action==="status"){
  const status=String(b.status||"");if(!["open","in_progress","waiting_user","resolved","closed"].includes(status))return NextResponse.json({error:"Invalid ticket status."},{status:400});
  const patch:any={status,closed_at:["resolved","closed"].includes(status)?new Date().toISOString():null};
  if(status!=="closed")patch.closed_at=null;
  const {data:ticket,error}=await s.from("zynth_support_tickets").update(patch).eq("id",ticketId).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ticket});
 }
 if(action==="priority"){
  const priority=String(b.priority||"normal");if(!["normal","high","urgent"].includes(priority))return NextResponse.json({error:"Invalid priority."},{status:400});
  const {data:ticket,error}=await s.from("zynth_support_tickets").update({priority}).eq("id",ticketId).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({ticket});
 }
 return NextResponse.json({error:"Unsupported support action."},{status:400});
}
