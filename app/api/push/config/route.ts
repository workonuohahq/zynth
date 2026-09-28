import {NextResponse} from "next/server";

export const dynamic="force-dynamic";

export async function GET(){
  const publicKey=process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY?.trim();
  if(!publicKey)return NextResponse.json({error:"Push notifications are not configured on the Vercel production environment."},{status:503});
  return NextResponse.json({publicKey});
}
