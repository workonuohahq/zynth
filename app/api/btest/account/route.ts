import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const accountId = cookies().get("zynth_btest_account")?.value || "";
  if (!accountId) return NextResponse.json({ error: "MT5 account session expired. Connect again from BTest." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data: account } = await supabase.from("mt5_accounts")
    .select("id,login,server,status,last_seen_at")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: "MT5 account was not found." }, { status: 404 });

  const { data: snapshot } = await supabase.from("mt5_account_snapshots")
    .select("*")
    .eq("account_id", accountId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: trades } = await supabase.from("mt5_trades")
    .select("*")
    .eq("account_id", accountId)
    .order("closed_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    account,
    snapshot,
    trades: trades || [],
    historyAvailable: (trades || []).length > 0,
    dataSource: snapshot ? "mt5-terminal-bridge" : "waiting-for-mt5-data"
  });
}
