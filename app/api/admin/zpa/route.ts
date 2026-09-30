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
      const qualificationDays=Number(b.qualification_period_days);
      const settlementDays=Number(b.settlement_period_days);
      const capitalRate=Number(b.capital_incentive_rate);
      if(!Number.isFinite(qualificationDays)||!Number.isFinite(settlementDays)||!Number.isFinite(capitalRate)){
        return NextResponse.json({error:"Invalid ZPA settings."},{status:400});
      }
      ({data,error}=await supabase.rpc("zynth_admin_zpa_settings",{
        p_admin_id:user.id,
        p_enabled:Boolean(b.enabled),
        p_qualification_days:qualificationDays,
        p_settlement_days:settlementDays,
        p_capital_rate:capitalRate
      }));
    }else if(b.action==="milestones"){
      if(!Array.isArray(b.milestones))return NextResponse.json({error:"Milestones must be an array."},{status:400});
      ({data,error}=await supabase.rpc("zynth_admin_zpa_milestones",{p_admin_id:user.id,p_milestones:b.milestones}));
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
