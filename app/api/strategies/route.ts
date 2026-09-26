import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(){
 const s=await createSupabaseServerClient();
 const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data:settings}=await s.from("system_settings").select("investment_enabled,strategy_entry_enabled").single();
 if(!settings?.investment_enabled||!settings?.strategy_entry_enabled)return NextResponse.json({strategies:[]});
 const {data,error}=await s.rpc("zynth_public_strategies");
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({strategies:Array.isArray(data)?data:[]});
}