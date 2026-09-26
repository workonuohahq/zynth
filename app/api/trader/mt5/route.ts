import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {encryptMt5Secret} from "@/lib/mt5-credentials";

async function auth(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user) return {s,user:null};
 const {data:p}=await s.from("users").select("role,account_status").eq("id",user.id).single();
 if(p?.role!=="trader"||p.account_status!=="active") return {s,user:null};
 return {s,user};
}
export async function GET(){
 const {s,user}=await auth(); if(!user)return NextResponse.json({error:"Trader access required."},{status:403});
 const {data,error}=await s.from("zynth_trader_mt5_credentials").select("id,mt5_login,mt5_server,status,submitted_at,verified_at,rejection_reason,updated_at").eq("user_id",user.id).maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({credentials:data?{...data,investor_password_set:true}:null});
}
export async function POST(req:Request){
 const {s,user}=await auth(); if(!user)return NextResponse.json({error:"Trader access required."},{status:403});
 const b=await req.json().catch(()=>({}));
 const login=String(b.mt5Login||"").trim();
 const server=String(b.mt5Server||"").trim();
 const password=String(b.investorPassword||"");
 if(!/^\d{4,20}$/.test(login))return NextResponse.json({error:"Enter a valid MT5 login number."},{status:400});
 if(server.length<2||server.length>160)return NextResponse.json({error:"Enter your MT5 broker server exactly as shown in MT5."},{status:400});
 if(password.length<4||password.length>200)return NextResponse.json({error:"Enter a valid investor password."},{status:400});
 let encrypted:string; try{encrypted=encryptMt5Secret(password)}catch(e:any){return NextResponse.json({error:e.message},{status:500});}
 const {data,error}=await s.from("zynth_trader_mt5_credentials").upsert({
   user_id:user.id,mt5_login:login,mt5_server:server,investor_password_ciphertext:encrypted,
   status:"pending",submitted_at:new Date().toISOString(),verified_at:null,verified_by:null,rejection_reason:null,updated_at:new Date().toISOString()
 },{onConflict:"user_id"}).select("id,mt5_login,mt5_server,status,submitted_at,verified_at,rejection_reason,updated_at").single();
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({credentials:{...data,investor_password_set:true},message:"MT5 details submitted for administrator verification."});
}
