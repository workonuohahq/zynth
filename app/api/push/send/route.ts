import {NextResponse} from "next/server";
import webpush from "web-push";
import {createClient} from "@supabase/supabase-js";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;

const categoryFor=(type:string)=>{
  if(["deposit","withdrawal","redemption","vault","money_movement"].includes(type))return "money";
  if(["investment","strategy","profit"].includes(type))return "investments";
  if(["security","login","account"].includes(type))return "security";
  if(["trader","daily_report","discipline"].includes(type))return "trader";
  return "system";
};

const authorized=(req:Request)=>{
  const secret=process.env.ZYNTH_PUSH_WORKER_SECRET?.trim();
  return Boolean(secret && req.headers.get("x-zynth-push-secret")===secret);
};

function describePushError(error:any){
  return {
    statusCode:Number(error?.statusCode||0)||null,
    body:typeof error?.body==="string"?error.body.slice(0,500):null,
    message:String(error?.message||error).slice(0,500)
  };
}

export async function POST(req:Request){
  if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});

  const publicKey=process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY?.trim();
  const privateKey=process.env.ZYNTH_VAPID_PRIVATE_KEY?.trim();
  const subject=process.env.ZYNTH_VAPID_SUBJECT?.trim()||"mailto:security@zynthhq.vercel.app";
  if(!publicKey||!privateKey)return NextResponse.json({error:"Push service is not configured."},{status:503});

  const body=await req.json().catch(()=>({}));
  const notificationId=String(body.notification_id||"").trim();
  if(!notificationId)return NextResponse.json({error:"notification_id is required."},{status:400});

  try{webpush.setVapidDetails(subject,publicKey,privateKey);}
  catch{return NextResponse.json({error:"VAPID credentials are invalid."},{status:503});}

  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const workerSecret=process.env.ZYNTH_PUSH_WORKER_SECRET?.trim();
  if(!supabaseUrl||!publishableKey||!workerSecret)return NextResponse.json({error:"Push data service is not configured."},{status:503});

  const supabase=createClient(supabaseUrl,publishableKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:context,error:contextError}=await supabase.rpc("zynth_get_push_delivery_context",{p_notification_id:notificationId,p_secret:workerSecret});
  if(contextError)return NextResponse.json({error:"Unable to load push delivery context."},{status:500});
  if(!context?.notification)return NextResponse.json({error:"Notification not found."},{status:404});

  const notice=context.notification;
  const preferences=context.preferences||{};
  const subscriptions=Array.isArray(context.subscriptions)?context.subscriptions:[];
  if(preferences?.push_enabled===false || preferences?.[categoryFor(notice.type)]===false){
    return NextResponse.json({ok:true,status:"skipped",reason:"disabled"});
  }
  if(!subscriptions.length)return NextResponse.json({ok:true,status:"skipped",reason:"no_active_device"});

  const metadata=notice.metadata&&typeof notice.metadata==="object"?notice.metadata:{};
  const url=typeof metadata.action_url==="string"&&metadata.action_url.startsWith("/")?metadata.action_url:"/dashboard/notifications";
  const payload=JSON.stringify({
    title:notice.title,
    body:notice.body,
    url,
    tag:"zynth-"+notice.id,
    icon:"/icons/zynth-icon.svg",
    badge:"/icons/zynth-icon.svg"
  });

  let delivered=0,revoked=0,failed=0;
  for(const subscription of subscriptions){
    try{
      await webpush.sendNotification(
        {endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},
        payload,
        {TTL:86400}
      );
      delivered++;
    }catch(error:any){
      const detail=describePushError(error);
      if(detail.statusCode===404||detail.statusCode===410){
        const {error:revokeError}=await supabase.rpc("zynth_revoke_push_subscription",{p_subscription_id:subscription.id,p_secret:workerSecret});
        if(revokeError) console.error("[ZYNTH_PUSH_REVOKE_FAILED]",{notificationId,subscriptionId:subscription.id,message:revokeError.message});
        revoked++;
        continue;
      }
      failed++;
      console.error("[ZYNTH_PUSH_DELIVERY_FAILED]",{
        notificationId,
        subscriptionId:subscription.id,
        endpointHost: (()=>{try{return new URL(subscription.endpoint).host}catch{return "invalid"}})(),
        ...detail
      });
    }
  }

  const status=delivered>0?(failed>0||revoked>0?"partial":"sent"):"failed";
  if(failed>0){
    console.error("[ZYNTH_PUSH_DELIVERY_SUMMARY]",{notificationId,delivered,failed,revoked,status});
  }
  return NextResponse.json({ok:delivered>0,status,delivered,failed,revoked});
}

export async function GET(req:Request){
  return POST(req);
}
