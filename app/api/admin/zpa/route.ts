import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export async function GET(){
  try{
    const {supabase,user}=await getAdminContext();
    if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
    const {data,error}=await supabase.rpc("zynth_admin_zpa_dashboard",{p_admin_id:user.id});
    if(error)throw error;
    return NextResponse.json(data);
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Unable to load ZPA management."},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const {supabase,user}=await getAdminContext();
    if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
    const b=await req.json().catch(()=>({}));
    let data:any,error:any;
    if(b.action==="settings"){
      ({data,error}=await supabase.rpc("zynth_admin_zpa_settings",{
        p_admin_id:user.id,p_enabled:Boolean(b.enabled),
        p_qualification_days:Number(b.qualification_days),
        p_settlement_days:Number(b.settlement_days),
        p_capital_rate:Number(b.capital_rate)
      }));
    }else if(b.action==="milestones"){
      ({data,error}=await supabase.rpc("zynth_admin_zpa_milestones",{p_admin_id:user.id,p_milestones:Array.isArray(b.milestones)?b.milestones:[]}));
    }else if(b.action==="attribute"){
      ({data,error}=await supabase.rpc("zynth_admin_zpa_attribute",{p_admin_id:user.id,p_zpa_id:String(b.zpa_id),p_investor_id:String(b.investor_id)}));
    }else if(b.action==="detail"){
      ({data,error}=await supabase.rpc("zynth_admin_zpa_detail",{p_admin_id:user.id,p_zpa_id:String(b.zpa_id)}));
    }else{
      return NextResponse.json({error:"Unsupported ZPA action."},{status:400});
    }
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json(data||{ok:true});
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Unable to update ZPA management."},{status:500});
  }
}
