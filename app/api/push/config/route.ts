import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){
  const key=process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY;
  if(!key)return NextResponse.json({error:"Push notifications are not configured."},{status:503});
  return NextResponse.json({publicKey:key});
}
