import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const accountId = cookies().get("zynth_btest_account")?.value || "";
  if (accountId) {
    const supabase = createSupabaseAdminClient();
    await supabase.from("mt5_accounts").update({ status: "disconnected" })
      .eq("id", accountId).eq("user_id", user.id);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("zynth_btest_account");
  return response;
}
