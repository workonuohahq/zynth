import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import VerificationRequiredClient from "@/components/verification-required-client";

export default async function VerificationRequiredPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: status } = await supabase.rpc("zynth_get_email_verification_status", { p_user_id: user.id });
  if (status?.verified) redirect("/dashboard");
  return <VerificationRequiredClient email={user.email || ""}/>;
}
