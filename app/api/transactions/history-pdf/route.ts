import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Tx = {id:string;type:string;amount:number;status:string;created_at:string;reference:string|null;metadata:Record<string,any>|null};
const clean=(v:any)=>String(v??"").replace(/[\\()]/g," ").replace(/\r?\n/g," ").trim();
const money=(v:any)=>"NGN "+Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});

function makePdf(lines:string[]){
  let stream="BT\n/F1 5.5 Tf\n50 805 Td\n";
  lines.forEach((line,i)=>{if(i>0)stream+="0 -6.7 Td\n";stream+="("+clean(line)+") Tj\n";});
  stream+="ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+Buffer.byteLength(stream,"utf8")+" >>\nstream\n"+stream+"\nendstream"];
  let pdf="%PDF-1.4\n"; const offsets:number[]=[];
  objects.forEach((obj,i)=>{offsets[i+1]=Buffer.byteLength(pdf,"utf8");pdf+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";});
  const xref=Buffer.byteLength(pdf,"utf8");
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<=objects.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return Buffer.from(pdf,"utf8");
}

export async function GET(){
  const s=await createSupabaseServerClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const [{data:profile},{data:transactions,error}]=await Promise.all([
    s.from("users").select("full_name").eq("id",user.id).single(),
    s.from("transactions").select("id,type,amount,status,created_at,reference,metadata").eq("user_id",user.id).order("created_at",{ascending:false})
  ]);
  if(error)return NextResponse.json({error:"Unable to generate transaction history."},{status:500});
  const rows=(transactions||[]) as Tx[];
  const lines=["ZYNTH TRANSACTION HISTORY","Account: "+(profile?.full_name||"ZYNTH User"),"Generated: "+new Date().toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"}),"","Total records: "+rows.length,""];
  rows.forEach((r,i)=>{
    const meta=r.metadata||{};
    const detail=meta.method||meta.payment_method||meta.pay_currency||meta.source;
    const date=new Date(r.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});
    const second="   "+date+(r.reference?" | Ref: "+r.reference:"")+(detail?" | "+String(detail):"")+(meta.pay_currency?" | "+String(meta.pay_currency).toUpperCase():"");
    lines.push((i+1)+". "+r.type.replaceAll("_"," ").toUpperCase()+" | "+money(r.amount)+" | "+r.status.toUpperCase());
    lines.push(second);
  });
  return new NextResponse(makePdf(lines),{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\"zynth-transaction-history-"+new Date().toISOString().slice(0,10)+".pdf\"","Cache-Control":"private, no-store"}});
}