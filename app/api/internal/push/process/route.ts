import {NextResponse} from "next/server";
import webpush from "web-push";
import {createClient} from "@supabase/supabase-js";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

const categoryFor=(type:string)=>{
  if(["deposit","withdrawal","redemption","vault","money_movement"].includes(type))return "money";
  if(["investment","strategy","profit"].includes(type))return "investments";
  if(["security","login","account"].includes(type))return "security";
  if(["trader","daily_report","discipline"].includes(type))return "trader";
  return "system";
};
const authorized=(req:Request)=>{
  const worker=process.env.ZYNTH_PUSH_WORKER_SECRET?.trim();
  const cron=process.env.CRON_SECRET?.trim();
  return Boolean((worker&&req.headers.get("x-zynth-push-secret")===worker)||(cron&&req.headers.get("authorization")===`Bearer ${cron}`));
};

export async function POST(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  const secret=process.env.ZYNTH_PUSH_WORKER_SECRET?.trim();
  const publicKey=process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY?.trim();
  const privateKey=process.env.ZYNTH_VAPID_PRIVATE_KEY?.trim();
  const subject=process.env.ZYNTH_VAPID_SUBJECT?.trim()||"mailto:security@zynthhq.vercel.app";
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if(!secret)return NextResponse.json({error:"Push worker secret is not configured."},{status:503});
  if(!publicKey||!privateKey)return NextResponse.json({error:"VAPID credentials are not configured."},{status:503});
  if(!supabaseUrl||!supabaseKey)return NextResponse.json({error:"Supabase runtime credentials are not configured."},{status:503});
  try{webpush.setVapidDetails(subject,publicKey,privateKey);}catch{return NextResponse.json({error:"VAPID credentials are invalid."},{status:503});}

  const admin=createClient(supabaseUrl,supabaseKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:jobs,error:claimError}=await admin.rpc("zynth_claim_push_jobs",{p_limit:10,p_secret:secret});
  if(claimError)return NextResponse.json({error:claimError.message},{status:500});

  let delivered=0,skipped=0,failed=0,revoked=0;
  for(const job of jobs||[]){
    try{
      const {data:context,error:contextError}=await admin.rpc("zynth_get_push_job_context",{p_job_id:job.id,p_secret:secret});
      if(contextError)throw contextError;
      const notice=context?.notification,preferences=context?.preferences,subscriptions=context?.subscriptions||[];
      if(!notice||preferences?.push_enabled===false||preferences?.[categoryFor(notice.type)]===false||!subscriptions.length){
        await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"sent",p_secret:secret});skipped++;continue;
      }
      const metadata=notice.metadata&&typeof notice.metadata==="object"?notice.metadata:{};
      const url=typeof metadata.action_url==="string"&&metadata.action_url.startsWith("/")?metadata.action_url:"/dashboard/notifications";
      const payload=JSON.stringify({title:notice.title,body:notice.body,url,tag:"zynth-"+notice.id,icon:"/icons/zynth-icon.svg",badge:"/icons/zynth-icon.svg"});
      let jobDelivered=0;
      for(const sub of subscriptions){
        try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{TTL:86400});jobDelivered++;}
        catch(error:any){
          const status=Number(error?.statusCode||0);
          if(status===404||status===410){
            const {error:e}=await admin.rpc("zynth_revoke_push_subscription",{p_subscription_id:sub.id,p_secret:secret});
            if(e)throw e;revoked++;
          }else throw error;
        }
      }
      await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"sent",p_secret:secret});
      jobDelivered?delivered++:skipped++;
    }catch(error:any){
      failed++;
      const attempts=Number(job.attempts||1);
      const delay=Math.min(3600,Math.max(30,Math.pow(2,Math.min(attempts,7))*30));
      await admin.rpc("zynth_complete_push_job",{p_id:job.id,p_status:"failed",p_error:String(error?.message||error).slice(0,1000),p_delay_seconds:delay,p_secret:secret});
    }
  }
  return NextResponse.json({ok:true,processed:(jobs||[]).length,delivered,skipped,failed,revoked});
}
export async function GET(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({ok:true,service:"zynth-push-worker"});
}
