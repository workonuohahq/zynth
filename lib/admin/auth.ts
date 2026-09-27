import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAdminContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null };

  const { data: roles, error } = await supabase.rpc("zynth_get_my_roles", {
    p_user_id: user.id,
  });

  if (error || !Array.isArray(roles) || !roles.includes("admin")) {
    return { supabase, user: null };
  }

  const { data: account } = await supabase
    .from("users")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (account?.account_status && account.account_status !== "active") {
    return { supabase, user: null };
  }

  return { supabase, user };
}
