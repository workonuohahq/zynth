import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminWithdrawalDetail from "@/components/admin-withdrawal-detail";

export default async function AdminWithdrawalDetailPage({params}:{params:{id:string}}){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login");
 const {data:profile}=await supabase.from("users").select("role").eq("id",user.id).single();
 if(profile?.role!=="admin")redirect("/dashboard");
 const {data,error}=await supabase.rpc("admin_withdrawal_detail",{p_withdrawal_id:params.id});
 if(error||!data)notFound();
 return <main className="admin-detail-page"><div className="admin-detail-wrap"><Link href="/admin" className="text-action">← Back to admin withdrawals</Link><AdminWithdrawalDetail initial={data}/></div></main>;
}