import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:{id:string}}){
 try{
  const s=await createSupabaseServerClient();const{data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const{data,error}=await s.rpc("zynth_statement_pdf",{p_user_id:user.id,p_statement_id:params.id});
  if(error||!data?.pdf_bytes)return NextResponse.json({error:"Statement PDF unavailable."},{status:404});
  const bytes=Buffer.from(String(data.pdf_bytes),"base64");
  const filename="ZYNTH-Vault-Statement-"+data.period_start+"-v"+data.version+".pdf";
  return new NextResponse(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=\""+filename+"\"","Cache-Control":"private, no-store"}});
 }catch(e:any){return NextResponse.json({error:e.message||"Unable to download statement."},{status:500})}
}