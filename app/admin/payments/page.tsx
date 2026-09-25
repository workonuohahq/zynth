import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PaymentSettings from "@/components/payment-settings";

export default async function AdminPaymentSettingsPage(){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");

  const {data:profile}=await supabase.from("users").select("role").eq("id",user.id).single();
  if(profile?.role!=="admin") redirect("/dashboard");

  const {data,error}=await supabase.rpc("admin_overview");
  if(error || !data?.settings) throw new Error("Unable to load payment settings.");

  return <div className="admin-frame">
    <aside className="admin-sidebar">
      <a className="brand" href="/admin"><span className="brand-mark">Z</span><span>ZYNTH</span></a>
      <div className="admin-caption">CONTROL PLANE</div>
      <nav className="admin-nav-group">
        <span>OPERATIONS</span>
        <a className="admin-nav" href="/admin">Admin overview</a>
        <a className="admin-nav" href="/admin/deposits">Deposits</a>
        <a className="admin-nav active" href="/admin/payments">Payment settings</a>
      </nav>
      <div className="admin-sidebar-bottom">
        <div className="secure">Founder access</div>
        <a className="admin-back" href="/dashboard">User dashboard</a>
      </div>
    </aside>
    <PaymentSettings initialData={data.settings}/>
  </div>;
}
