import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(){
  const s=await createSupabaseServerClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

  // Strategy visibility is controlled by the secured database function.
  // Do not read system_settings directly here: investor RLS can legitimately
  // hide that operational table and would otherwise turn a valid strategy
  // list into an empty response.
  const {data,error}=await s.rpc("zynth_public_strategies");
  if(error)return NextResponse.json({error:error.message},{status:400});

  return NextResponse.json({strategies:Array.isArray(data)?data:[]});
}
