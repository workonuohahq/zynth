import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getAdmin(){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return {supabase,user:null};
  const {data:profile}=await supabase.from("users").select("role").eq("id",user.id).single();
  return profile?.role==="admin"?{supabase,user}:{supabase,user:null};
}

export async function GET(_request:Request,{params}:{params:{id:string}}){
  try{
    const {supabase,user}=await getAdmin();
    if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
    const {data,error}=await supabase.rpc("admin_get_user_detail",{p_admin_user_id:user.id,p_user_id:params.id});
    if(error)throw error;
    return NextResponse.json(data);
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Unable to load this user."},{status:500});
  }
}

export async function PATCH(request:Request,{params}:{params:{id:string}}){
  try{
    const {supabase,user}=await getAdmin();
    if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
    const body=await request.json();
    let data:any,error:any;
    if(body.action==="profile"){
      ({data,error}=await supabase.rpc("admin_update_user",{p_admin_user_id:user.id,p_user_id:params.id,p_full_name:String(body.full_name||""),p_kyc_verified:Boolean(body.kyc_verified)}));
    }else if(body.action==="status"){
      ({data,error}=await supabase.rpc("admin_set_user_status",{p_admin_user_id:user.id,p_user_id:params.id,p_status:String(body.status),p_reason:String(body.reason||"")}));
    }else if(body.action==="wallet"){
      ({data,error}=await supabase.rpc("admin_adjust_wallet",{p_admin_user_id:user.id,p_user_id:params.id,p_direction:String(body.direction),p_amount:Number(body.amount),p_reason:String(body.reason||"")}));
    }else if(body.action==="note"){
      ({data,error}=await supabase.rpc("admin_add_user_note",{p_admin_user_id:user.id,p_user_id:params.id,p_note:String(body.note||"")}));
    }else{
      return NextResponse.json({error:"Unsupported user action."},{status:400});
    }
    if(error)return NextResponse.json({error:error.message,code:error.message},{status:400});
    return NextResponse.json(data||{ok:true});
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Unable to update this user."},{status:500});
  }
}
