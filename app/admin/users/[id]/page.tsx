import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminUserDetail from "@/components/admin-user-detail";

export default async function AdminUserPage({params}:{params:{id:string}}){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:profile}=await supabase.from("users").select("role").eq("id",user.id).single();
  if(profile?.role!=="admin")redirect("/dashboard");
  const {data,error}=await supabase.rpc("admin_get_user_detail",{p_admin_user_id:user.id,p_user_id:params.id});
  if(error||!data)notFound();
  return <AdminUserDetail initial={data}/>;
}
