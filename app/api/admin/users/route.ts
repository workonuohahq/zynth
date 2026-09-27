import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function adminClient(){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {supabase,user:null};
  const {data:ok}=await supabase.rpc("zynth_has_role",{p_user_id:user.id,p_role_key:"admin"});
  if(!ok)return {supabase,user:null};
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
    const payload=data||{total:0,items:[]};
    const ids=(payload.items||[]).map((x:any)=>x.id);
    let rolesByUser:any={};
    if(ids.length){
      const rr=await supabase.rpc("zynth_admin_user_roles_map",{p_admin_id:user.id,p_user_ids:ids});
      if(rr.error)throw rr.error;
      rolesByUser=rr.data||{};
    }
    return NextResponse.json({
      ...payload,
      items:(payload.items||[]).map((x:any)=>({
        ...x,
        roles:rolesByUser[x.id]||[{key:x.role==="user"?"investor":x.role,name:x.role==="user"?"Investor":x.role}]
      }))
    });
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Unable to load users."},{status:500});
  }
}
