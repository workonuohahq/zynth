import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function GET(){
 const s=await createSupabaseServerClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const {data:profile}=await s.from("users").select("full_name,email,role,kyc_verified,created_at").eq("id",user.id).single();
 return NextResponse.json({profile,user:{email:user.email}});
}