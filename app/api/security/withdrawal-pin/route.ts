import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(){
 try{
  const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const {data,error}=await client.rpc("zynth_withdrawal_pin_status");
  if(error)throw error;
  return NextResponse.json(data);
 }catch{return NextResponse.json({error:"Unable to load withdrawal PIN status."},{status:500});}
}
export async function POST(request:Request){
 try{
  const body=await request.json();const action=String(body?.action||"");const client=await createSupabaseServerClient();
  const {data:{user}}=await client.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  let data,error;
  if(action==="set"){data=await client.rpc("zynth_set_withdrawal_pin",{p_pin:String(body?.pin||"")}).then(x=>x).then(x=>({data:x.data,error:x.error}));}
  else if(action==="change"){data=await client.rpc("zynth_change_withdrawal_pin",{p_current_pin:String(body?.currentPin||""),p_new_pin:String(body?.newPin||"")}).then(x=>({data:x.data,error:x.error}));}
  else return NextResponse.json({error:"Invalid action."},{status:400});
  if(data.error){const code=data.error.message;const map:any={PIN_MUST_BE_6_DIGITS:"PIN must contain exactly 6 digits.",PIN_TOO_WEAK:"Choose a less predictable 6-digit PIN.",PIN_ALREADY_SET:"A withdrawal PIN is already configured. Use Change PIN instead.",PIN_NOT_SET:"No withdrawal PIN is configured.",INVALID_PIN:"Current PIN is incorrect.",PIN_LOCKED:"PIN changes are temporarily locked."};return NextResponse.json({error:map[code]||"Unable to update withdrawal PIN.",code},{status:400});}
  return NextResponse.json(data.data||{ok:true});
 }catch{return NextResponse.json({error:"Unable to update withdrawal PIN."},{status:500});}
}