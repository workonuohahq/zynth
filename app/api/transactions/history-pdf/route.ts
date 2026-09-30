import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

type Tx = {id:string;type:string;amount:number;status:string;created_at:string;reference:string|null;metadata:Record<string,any>|null};
const clean=(v:any)=>String(v??"").replace(/[\\()]/g," ").replace(/\r?\n/g," ").trim();
const money=(v:any)=>"NGN "+Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});

function pdfText(x:number,y:number,size:number,value:any,font="F1",color=[1,1,1]){
  const v=clean(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  return "BT /"+font+" "+size+" Tf "+color[0]+" "+color[1]+" "+color[2]+" rg "+x+" "+y+" Td ("+v+") Tj ET\n";
}
function pdfRect(x:number,y:number,w:number,h:number,r:number,g:number,b:number){return "q "+r+" "+g+" "+b+" rg "+x+" "+y+" "+w+" "+h+" re f Q\n";}
function pdfLine(x:number,y:number,w:number,r:number,g:number,b:number){return "q "+r+" "+g+" "+b+" RG .5 w "+x+" "+y+" m "+(x+w)+" "+y+" l S Q\n";}

function makePages(rows:Tx[],name:string){
  const pages:string[]=[];
  const credits=rows.filter(r=>["deposit","cycle_payout","zpa_commission"].includes(r.type)).reduce((a,r)=>a+Number(r.amount||0),0);
  const debits=rows.filter(r=>!["deposit","cycle_payout","zpa_commission"].includes(r.type)).reduce((a,r)=>a+Number(r.amount||0),0);
  const generated=new Date().toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});
  const chunks=rows.length?Array.from({length:Math.ceil(rows.length/18)},(_,i)=>rows.slice(i*18,i*18+18)):[[]];

  chunks.forEach((chunk,pageIndex)=>{
    let s=pdfRect(0,0,595,842,.035,.035,.045);
    s+=pdfRect(0,770,595,72,.06,.06,.07);
    s+=pdfText(42,806,25,"ZYNTH","F2",[.86,.68,.20]);
    s+=pdfText(42,786,7.5,"LET YOUR CAPITAL WORK.","F2",[.72,.72,.75]);
    s+=pdfText(400,807,8,"TRANSACTION STATEMENT","F2",[.75,.75,.78]);
    s+=pdfText(442,792,7,"CONFIDENTIAL","F2",[.86,.68,.20]);
    s+=pdfText(42,742,17,"Transaction History","F2",[.95,.95,.96]);
    s+=pdfText(42,726,8,name||"ZYNTH User","F1",[.68,.69,.72]);
    s+=pdfText(42,712,7,"Generated "+generated,"F1",[.48,.49,.52]);

    if(pageIndex===0){
      s+=pdfRect(42,650,162,45,.075,.075,.09);
      s+=pdfText(54,679,7,"TOTAL TRANSACTIONS","F2",[.55,.56,.60]);
      s+=pdfText(54,660,13,String(rows.length),"F2",[.95,.95,.96]);
      s+=pdfRect(216,650,162,45,.075,.075,.09);
      s+=pdfText(228,679,7,"TOTAL CREDITS","F2",[.55,.56,.60]);
      s+=pdfText(228,660,11,money(credits),"F2",[.86,.68,.20]);
      s+=pdfRect(390,650,162,45,.075,.075,.09);
      s+=pdfText(402,679,7,"TOTAL DEBITS","F2",[.55,.56,.60]);
      s+=pdfText(402,660,11,money(debits),"F2",[.95,.95,.96]);
    }

    const top=pageIndex===0?625:690;
    s+=pdfRect(42,top-22,510,22,.11,.11,.13);
    s+=pdfText(52,top-15,6.5,"DATE / TIME","F2",[.65,.66,.70]);
    s+=pdfText(142,top-15,6.5,"TRANSACTION","F2",[.65,.66,.70]);
    s+=pdfText(278,top-15,6.5,"REFERENCE / METHOD","F2",[.65,.66,.70]);
    s+=pdfText(424,top-15,6.5,"AMOUNT","F2",[.65,.66,.70]);
    s+=pdfText(492,top-15,6.5,"STATUS","F2",[.65,.66,.70]);

    let y=top-42;
    chunk.forEach((r)=>{
      const meta=r.metadata||{};
      const date=new Date(r.created_at).toLocaleString("en-NG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
      const type=r.type.replaceAll("_"," ").toUpperCase().slice(0,20);
      const ref=String(r.reference||meta.pay_currency||meta.method||meta.payment_method||"—").slice(0,22);
      const status=r.status.toUpperCase();
      const positive=["deposit","cycle_payout","zpa_commission"].includes(r.type);
      s+=pdfRect(42,y-9,510,27,.055,.055,.065);
      s+=pdfText(52,y,6.7,date,"F1",[.72,.73,.76]);
      s+=pdfText(142,y,7.1,type,"F2",[.94,.94,.96]);
      s+=pdfText(278,y,6.5,ref,"F1",[.58,.59,.63]);
      s+=pdfText(424,y,7.1,(positive?"+":"−")+money(r.amount),"F2",positive?[.86,.68,.20]:[.94,.94,.94]);
      const sc=status==="COMPLETED"?[.35,.80,.58]:status==="PENDING"?[.95,.70,.25]:[.95,.42,.42];
      s+=pdfText(492,y,6.2,status.slice(0,10),"F2",sc);
      y-=29;
    });

    s+=pdfLine(42,40,510,.16,.16,.18);
    s+=pdfText(42,25,6.5,"ZYNTH • Confidential account statement","F1",[.45,.46,.49]);
    s+=pdfText(500,25,6.5,"Page "+(pageIndex+1),"F1",[.60,.61,.64]);
    pages.push(s);
  });
  return pages;
}

function buildPdf(pages:string[]){
  const out:string[]=["<< /Type /Catalog /Pages 2 0 R >>",""];
  const kids:number[]=[];
  pages.forEach(stream=>{
    const pageId=out.length+1;
    const fontId=pageId+1,boldId=pageId+2,contentId=pageId+3;
    kids.push(pageId);
    out.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 "+fontId+" 0 R /F2 "+boldId+" 0 R >> >> /Contents "+contentId+" 0 R >>");
    out.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    out.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    out.push("<< /Length "+Buffer.byteLength(stream,"utf8")+" >>\nstream\n"+stream+"\nendstream");
  });
  out[1]="<< /Type /Pages /Kids ["+kids.map(id=>id+" 0 R").join(" ")+"] /Count "+pages.length+" >>";
  let pdf="%PDF-1.4\n";
  const offsets:number[]=[];
  out.forEach((obj,i)=>{offsets[i+1]=Buffer.byteLength(pdf,"utf8");pdf+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";});
  const xref=Buffer.byteLength(pdf,"utf8");
  pdf+="xref\n0 "+(out.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<=out.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(out.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return Buffer.from(pdf,"utf8");
}

export async function GET(request:Request){
  const cookieClient=await createSupabaseServerClient();
  let s=cookieClient;
  let {data:{user}}=await s.auth.getUser();
  if(!user){
    const bearer=request.headers.get("authorization");
    const token=bearer?.match(/^Bearer\\s+(.+)$/i)?.[1];
    if(token){
      s=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:"Bearer "+token}}});
      const result=await s.auth.getUser(token);
      user=result.data.user;
    }
  }
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
  return new Response(new Uint8Array(makePdf(lines)),{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\"zynth-transaction-history-"+new Date().toISOString().slice(0,10)+".pdf\"","Cache-Control":"private, no-store"}});
}