import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function adminClient(){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {supabase,user:null};
  const {data:profile}=await supabase.from("users").select("role").eq("id",user.id).single();
  if(profile?.role!=="admin")return {supabase,user:null};
  return {supabase,user};
}

export async function GET(request:Request){
  try{
    const {supabase,user}=await adminClient();
    if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
    const url=new URL(request.url);
    const {data,error}=await supabase.rpc("admin_users_list",{
      p_search:url.searchParams.get("q")||null,
      p_status:url.searchParams.get("status")||null,
      p_kyc:url.searchParams.get("kyc")||null,
      p_limit:Math.min(Number(url.searchParams.get("limit")||50),100),
      p_offset:Math.max(Number(url.searchParams.get("offset")||0),0)
    });
    if(error)throw error;
    return NextResponse.json(data||{total:0,items:[]});
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Unable to load users."},{status:500});
  }
}
