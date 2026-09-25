import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminPanel from "@/components/admin-panel";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw new Error("Unable to load the admin control plane.");
  return <AdminPanel initialData={data} adminEmail={user.email || ""} />;
}
