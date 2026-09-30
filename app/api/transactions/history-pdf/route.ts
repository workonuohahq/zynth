import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Tx = {id:string;type:string;amount:number;status:string;created_at:string;reference:string|null;metadata:Record<string,any>|null};
const clean=(v:any)=>String(v??"").replace(/[\\()]/g," ").replace(/\r?\n/g," ").trim();
const money=(v:any)=>"NGN "+Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});

function makePdf(lines:string[]):Buffer {
  const perPage=42;
  const pages:string[][]=[];
  for(let i=0;i<Math.max(lines.length,1);i+=perPage) pages.push(lines.slice(i,i+perPage));
  if(pages.length===0) pages.push(["No transaction history available."]);

  const objects:string[]=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [] /Count 0 >>"
  ];
  const pageIds:number[]=[];
  const contentIds:number[]=[];

  for(const page of pages){
    const contentId=objects.length+1;
    const pageId=contentId+1;
    let stream="BT\n/F1 10 Tf\n50 800 Td\n";
    for(let i=0;i<page.length;i++){
      if(i>0) stream+="0 -18 Td\n";
      stream+="("+clean(page[i])+") Tj\n";
    }
    stream+="ET";
    objects.push("<< /Length "+Buffer.byteLength(stream,"ascii")+" >>\nstream\n"+stream+"\nendstream");
    objects.push("");
    contentIds.push(contentId);
    pageIds.push(pageId);
  }

  const fontId=objects.length+1;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  for(let i=0;i<pageIds.length;i++){
    objects[pageIds[i]-1]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "+fontId+" 0 R >> >> /Contents "+contentIds[i]+" 0 R >>";
  }
  objects[1]="<< /Type /Pages /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>";

  let pdf="%PDF-1.4\n";
  const offsets:number[]=[];
  for(let i=0;i<objects.length;i++){
    const id=i+1;
    offsets[id]=Buffer.byteLength(pdf,"ascii");
    pdf+=id+" 0 obj\n"+objects[i]+"\nendobj\n";
  }
  const xref=Buffer.byteLength(pdf,"ascii");
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<=objects.length;i++) pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return Buffer.from(pdf,"ascii");
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
    lines.push((i+1)+". "+r.type.replaceAll("_"," ").toUpperCase()+" | "+money(r.amount)+" | "+r.status.toUpperCase());
    lines.push("   "+new Date(r.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})+(r.reference?" | Ref: "+r.reference:""));
    const meta=r.metadata||{}; const detail=meta.method||meta.payment_method||meta.pay_currency||meta.source;
    if(detail)lines.push("   Details: "+String(detail)+(meta.pay_currency?"  "+String(meta.pay_currency).toUpperCase():""));
    lines.push("");
  });
  return new NextResponse(makePdf(lines),{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\"zynth-transaction-history-"+new Date().toISOString().slice(0,10)+".pdf\"","Cache-Control":"private, no-store"}});
}