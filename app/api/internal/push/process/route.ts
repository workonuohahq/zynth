import {NextResponse} from "next/server";
import webpush from "web-push";
import {createClient} from "@supabase/supabase-js";

export const dynamic="force-dynamic";

const categoryFor=(type:string)=>{
  if(["deposit","withdrawal","redemption","vault","money_movement"].includes(type))return "money";
  if(["investment","strategy","profit"].includes(type))return "investments";
  if(["security","login","account"].includes(type))return "security";
  if(["trader","daily_report","discipline"].includes(type))return "trader";
  return "system";
};

export async function POST(req:Request){
  const secret=process.env.ZYNTH_PUSH_WORKER_SECRET;
  if(!secret||req.headers.get("x-zynth-push-secret")!==secret)return NextResponse.json({error:"Unauthorized"},{status:401});

  const publicKey=process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY;
  const privateKey=process.env.ZYNTH_VAPID_PRIVATE_KEY;
  const subject=process.env.ZYNTH_VAPID_SUBJECT||"mailto:security@zynthhq.vercel.app";
  if(!publicKey||!privateKey)return NextResponse.json({error:"Push credentials are not configured."},{status:503});

  webpush.setVapidDetails(subject,publicKey,privateKey);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:jobs,error:claimError}=await admin.rpc("zynth_claim_push_jobs",{p_limit:25,p_secret:secret});
  if(claimError)return NextResponse.json({error:claimError.message},{status:500});

  let sent=0,skipped=0,failed=0;
  for(const job of jobs||[]){
    try{
      const {data:context,error:contextError}=await admin.rpc("zynth_get_push_job_context",{p_job_id:job.id,p_secret:secret});
      if(contextError)throw contextError;
      const notice=context?.notification;
      const preferences=context?.preferences;
      const subscriptions=context?.subscriptions||[];

      if(!notice){
        await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"sent",p_secret:secret});
        skipped++;
        continue;
      }

      const category=categoryFor(notice.type);
      const preferenceValue=preferences?(preferences as Record<string, boolean | null>)[category]:undefined;
      if(preferences?.push_enabled===false || preferenceValue===false){
        await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"sent",p_secret:secret});
        skipped++;
        continue;
      }

      const metadata=notice.metadata&&typeof notice.metadata==="object"?notice.metadata:{};
      const actionUrl=typeof metadata.action_url==="string"&&metadata.action_url.startsWith("/")?metadata.action_url:"/dashboard/notifications";
      const payload=JSON.stringify({
        title:notice.title,
        body:notice.body,
        url:actionUrl,
        tag:"zynth-"+notice.id,
        icon:"/icons/zynth-icon.svg",
        badge:"/icons/zynth-icon.svg"
      });

      const active=subscriptions||[];
      if(!active.length){
        await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"sent",p_secret:secret});
        skipped++;
        continue;
      }

      for(const sub of active){
        try{
          await webpush.sendNotification(
            {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},
            payload,
            {TTL:86400}
          );
          
        }catch(error:any){
          if(error?.statusCode===404||error?.statusCode===410){
            
          }else{
            throw error;
          }
        }
      }

      await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"sent",p_secret:secret});
      sent++;
    }catch(error:any){
      failed++;
      const attempts=Number(job.attempts||1);
      const delay=Math.min(3600,Math.max(30,Math.pow(2,Math.min(attempts,7))*30));
      await admin.rpc("zynth_complete_push_job",{
        p_id:job.id,
        p_status:"failed",
        p_error:String(error?.message||error).slice(0,1000),
        p_delay_seconds:delay,p_secret:secret
      });
    }
  }

  return NextResponse.json({ok:true,processed:(jobs||[]).length,sent,skipped,failed});
}
