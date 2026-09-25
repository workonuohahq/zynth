import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { disconnectMT5 } from "@/lib/mt5/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const connectionId = cookies().get("zynth_btest_connection")?.value || "";
  const providerAccountId = cookies().get("zynth_btest_provider_account")?.value || "";
  const supabase = createSupabaseAdminClient();

  if (connectionId) {
    await supabase.from("mt5_connections").update({ status: "disconnected" })
      .eq("id", connectionId).eq("user_id", user.id);
  }
  if (providerAccountId) await disconnectMT5(providerAccountId).catch(() => {});

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("zynth_btest_provider_account");
  response.cookies.delete("zynth_btest_connection");
  return response;
}
