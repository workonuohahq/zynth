import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

async function session(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();return {s,user};}
export async function GET(req:Request){
  const {s,user}=await session(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {searchParams}=new URL(req.url); const ticketId=searchParams.get("ticket");
  const {data:tickets,error}=await s.from("zynth_support_tickets").select("id,ticket_number,subject,category,priority,status,last_message_at,user_unread_count,admin_unread_count,created_at,updated_at,assigned_admin_id").eq("user_id",user.id).order("updated_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(ticketId){
    const ticket=(tickets||[]).find((x:any)=>x.id===ticketId);
    if(!ticket)return NextResponse.json({error:"Support conversation not found."},{status:404});
    await s.from("zynth_support_tickets").update({user_unread_count:0}).eq("id",ticketId).eq("user_id",user.id);
    const {data:messages,error:me}=await s.from("zynth_support_messages").select("id,ticket_id,sender_user_id,sender_role,body,is_internal,created_at,read_at").eq("ticket_id",ticketId).eq("is_internal",false).order("created_at",{ascending:true});
    if(me)return NextResponse.json({error:me.message},{status:400});
    return NextResponse.json({tickets:tickets||[],ticket:{...ticket,user_unread_count:0},messages:messages||[]});
  }
  return NextResponse.json({tickets:tickets||[]});
}
export async function POST(req:Request){
  const {s,user}=await session(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const b=await req.json().catch(()=>({})); const body=String(b.body||"").trim(); const action=String(b.action||"message");
  if(action==="create"){
    const subject=String(b.subject||"").trim(); if(subject.length<3)return NextResponse.json({error:"Please provide a short subject."},{status:400});
    if(body.length<1)return NextResponse.json({error:"Please describe what you need help with."},{status:400});
    const {data:ticket,error}=await s.from("zynth_support_tickets").insert({user_id:user.id,subject,category:String(b.category||"general"),priority:String(b.priority||"normal")}).select("*").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    const {data:message,error:me}=await s.from("zynth_support_messages").insert({ticket_id:ticket.id,sender_user_id:user.id,sender_role:"user",body,is_internal:false}).select("*").single();
    if(me){await s.from("zynth_support_tickets").delete().eq("id",ticket.id).eq("user_id",user.id);return NextResponse.json({error:me.message},{status:400});}
    return NextResponse.json({ticket,message});
  }
  if(action==="message"){
    const ticketId=String(b.ticketId||""); if(!ticketId||!body)return NextResponse.json({error:"Message cannot be empty."},{status:400});
    const {data:ticket}=await s.from("zynth_support_tickets").select("id,status").eq("id",ticketId).eq("user_id",user.id).single();
    if(!ticket)return NextResponse.json({error:"Support conversation not found."},{status:404});
    const {data:message,error}=await s.from("zynth_support_messages").insert({ticket_id:ticketId,sender_user_id:user.id,sender_role:"user",body,is_internal:false}).select("*").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({message});
  }
  return NextResponse.json({error:"Unsupported support action."},{status:400});
}
export async function PATCH(req:Request){
  const {s,user}=await session(); if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const b=await req.json().catch(()=>({})); const ticketId=String(b.ticketId||""); const status=String(b.status||"");
  if(!["open","closed"].includes(status))return NextResponse.json({error:"Invalid status."},{status:400});
  const {data,error}=await s.from("zynth_support_tickets").update({status,closed_at:status==="closed"?new Date().toISOString():null}).eq("id",ticketId).eq("user_id",user.id).select("id,status").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ticket:data});
}