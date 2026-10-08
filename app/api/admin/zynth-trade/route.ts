import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export async function GET(){
  try{
    const {supabase,user}=await getAdminContext();
    if(!user) return NextResponse.json({error:"Administrator access required."},{status:403});
    const {data,error}=await supabase.rpc("zynth_admin_trade_list",{p_admin_id:user.id});
    if(error) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json(data||{instances:[],runs:[],reporting_window:{}});
  }catch(e:any){return NextResponse.json({error:e?.message||"Unable to load ZYNTH Trade."},{status:500});}
}
export async function POST(req:Request){
  try{
    const {supabase,user}=await getAdminContext();
    if(!user) return NextResponse.json({error:"Administrator access required."},{status:403});
    const b=await req.json().catch(()=>({}));
    const action=String(b.action||"");
    let data,error;
    if(action==="save"){
      data=await supabase.rpc("zynth_admin_trade_upsert",{
        p_admin_id:user.id,p_id:b.id||null,p_name:String(b.name||""),p_strategy_id:b.strategyId||null,
        p_status:String(b.status||"active"),p_source_mode:String(b.sourceMode||"simulation"),
        p_min_return_pct:Number(b.minReturnPct),p_max_return_pct:Number(b.maxReturnPct),
        p_distribution:String(b.distribution||"balanced"),p_decimal_places:Number(b.decimalPlaces??2),
        p_weekend_reporting:Boolean(b.weekendReporting),p_auto_verification:Boolean(b.autoVerification)
      });
      error=data.error; data=data.data;
    }else if(action==="verify"){
      const r=await supabase.rpc("zynth_admin_trade_verify",{p_admin_id:user.id,p_run_id:b.runId,p_approve:Boolean(b.approve),p_reason:String(b.reason||"")});
      error=r.error;data=r.data;
    }else if(action==="generate"){ const r=await supabase.rpc("zynth_trade_generate_daily",{p_admin_id:user.id,p_instance_id:b.instanceId,p_cycle_date:b.cycleDate||null}); error=r.error;data=r.data; } else return NextResponse.json({error:"Unsupported action."},{status:400});
    if(error) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json(data||{ok:true});
  }catch(e:any){return NextResponse.json({error:e?.message||"ZYNTH Trade operation failed."},{status:500});}
}