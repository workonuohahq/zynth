import {NextResponse} from "next/server";
import {createECDH} from "node:crypto";

export const dynamic="force-dynamic";

function derivePublicKey(privateKey:string){
  const ecdh=createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(privateKey,"base64url"));
  return ecdh.getPublicKey("base64url","uncompressed");
}

export async function GET(){
  const configuredPublicKey=process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY?.trim();
  const privateKey=process.env.ZYNTH_VAPID_PRIVATE_KEY?.trim();
  if(configuredPublicKey)return NextResponse.json({publicKey:configuredPublicKey});
  if(privateKey){
    try{return NextResponse.json({publicKey:derivePublicKey(privateKey)});}
    catch{return NextResponse.json({error:"Push notifications are misconfigured on this deployment."},{status:503});}
  }
  return NextResponse.json({error:"Push notifications are not configured on the Vercel production environment."},{status:503});
}
