import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export async function GET(){
 try{const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const [{data:profile,error:pErr},{data:form,error:fErr}]=await Promise.all([s.rpc("zynth_kyc_profile"),s.rpc("zynth_kyc_form_config")]);if(pErr)throw pErr;if(fErr)throw fErr;
 return NextResponse.json({...profile,fields:form?.fields||[],custom_data:form?.profile?.custom_data||{}});
 }catch(e){console.error(e);return NextResponse.json({error:"Unable to load KYC profile."},{status:500})}
}
export async function POST(request:Request){
 try{const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});const b=await request.json();
 const {data:config,error:cfgErr}=await s.rpc("zynth_kyc_form_config");if(cfgErr)throw cfgErr;
 const fields=config?.fields||[];const values=b.values||{};const missing=fields.filter((f:any)=>f.required&&!String(values[f.field_key]??"").trim());
 if(missing.length)return NextResponse.json({error:"Complete all required KYC fields.",missing:missing.map((f:any)=>f.field_key)},{status:400});
 const core=(key:string)=>values[key]??"";
 const {data,error}=await s.rpc("zynth_kyc_submit_profile",{p_first_name:String(core("legal_first_name")),p_middle_name:String(core("legal_middle_name")),p_last_name:String(core("legal_last_name")),p_dob:core("date_of_birth")||null,p_nationality:String(core("nationality")),p_country_of_residence:String(core("country_of_residence")),p_tax_residency:String(core("tax_residency")),p_source_of_funds:String(core("source_of_funds")),p_source_of_wealth:String(core("source_of_wealth")),p_address:b.address||null});if(error)throw error;
 const custom:any={};for(const f of fields)if(f.storage_mode==="custom"&&Object.prototype.hasOwnProperty.call(values,f.field_key))custom[f.field_key]=values[f.field_key];
 const {error:saveErr}=await s.rpc("zynth_kyc_save_custom_data",{p_custom_data:custom});if(saveErr)throw saveErr;
 return NextResponse.json({...data,ok:true});
 }catch(e){console.error(e);return NextResponse.json({error:e instanceof Error?e.message:"Unable to submit KYC."},{status:400})}
}