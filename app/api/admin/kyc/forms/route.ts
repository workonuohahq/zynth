import {NextResponse} from "next/server";
import {getAdminContext} from "@/lib/admin/auth";
export async function GET(){
 try{const {supabase,user}=await getAdminContext();if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});
 const {data,error}=await supabase.rpc("zynth_kyc_admin_form_fields",{p_admin_id:user.id});if(error)throw error;return NextResponse.json({fields:data||[]});
 }catch(e){console.error(e);return NextResponse.json({error:"Unable to load KYC form configuration."},{status:500})}
}
export async function POST(request:Request){
 try{const {supabase,user}=await getAdminContext();if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});const b=await request.json();
 const {data,error}=await supabase.rpc("zynth_kyc_admin_form_upsert",{p_admin_id:user.id,p_id:b.id||null,p_field_key:String(b.fieldKey||""),p_label:String(b.label||""),p_field_type:String(b.fieldType||"text"),p_section:String(b.section||"General"),p_help_text:String(b.helpText||""),p_options:Array.isArray(b.options)?b.options:[],p_required:b.required===true,p_active:b.active!==false,p_sort_order:Number(b.sortOrder||100),p_storage_mode:String(b.storageMode||"custom"),p_storage_key:b.storageKey?String(b.storageKey):null});
 if(error)throw error;return NextResponse.json(data||{ok:true});
 }catch(e){console.error(e);return NextResponse.json({error:e instanceof Error?e.message:"Unable to save KYC form field."},{status:400})}
}
export async function DELETE(request:Request){
 try{const {supabase,user}=await getAdminContext();if(!user)return NextResponse.json({error:"Admin authorization required."},{status:403});const b=await request.json();
 const {data,error}=await supabase.rpc("zynth_kyc_admin_form_remove",{p_admin_id:user.id,p_id:String(b.id||"")});if(error)throw error;return NextResponse.json(data||{ok:true});
 }catch(e){console.error(e);return NextResponse.json({error:e instanceof Error?e.message:"Unable to remove KYC form field."},{status:400})}
}