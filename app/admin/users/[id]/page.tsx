import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminUserDetail from "@/components/admin-user-detail";

export default async function AdminUserPage({params}:{params:{id:string}}){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:isAdmin}=await supabase.rpc("zynth_has_role",{p_user_id:user.id,p_role_key:"admin"});
  if(!isAdmin)redirect("/dashboard");
  const {data,error}=await supabase.rpc("admin_get_user_detail",{p_admin_user_id:user.id,p_user_id:params.id});
  if(error||!data)notFound();
  const [roles,catalog]=await Promise.all([
    supabase.rpc("zynth_admin_get_user_roles",{p_admin_id:user.id,p_user_id:params.id}),
    supabase.rpc("zynth_admin_role_catalog",{p_admin_id:user.id})
  ]);
  if(roles.error||catalog.error)notFound();
  return <AdminUserDetail initial={{...data,roles:roles.data||[],role_catalog:catalog.data||[]}}/>;
}
