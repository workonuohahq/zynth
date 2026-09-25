import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMT5Account, getMT5Positions, normalizeAccount, normalizePosition } from "@/lib/mt5/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const connectionId = cookies().get("zynth_btest_connection")?.value || "";
  const providerAccountId = cookies().get("zynth_btest_provider_account")?.value || "";
  if (!connectionId || !providerAccountId) {
    return NextResponse.json({ error: "MT5 session expired. Connect again from BTest." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: connection } = await supabase.from("mt5_connections")
      .select("id,provider_account_id,mt5_login,mt5_server")
      .eq("id", connectionId).eq("user_id", user.id).maybeSingle();
    if (!connection || connection.provider_account_id !== providerAccountId) {
      return NextResponse.json({ error: "MT5 connection record was not found." }, { status: 404 });
    }

    const accountRaw = await getMT5Account(providerAccountId);
    const snapshot = normalizeAccount(accountRaw, {
      login: connection.mt5_login, server: connection.mt5_server, providerAccountId
    });
    const positionRaw = await getMT5Positions(providerAccountId);
    const positions = positionRaw.map(normalizePosition);

    await supabase.from("mt5_connections").update({
      status: "connected", last_seen_at: new Date().toISOString()
    }).eq("id", connectionId).eq("user_id", user.id);

    await supabase.from("mt5_account_snapshots").insert({
      connection_id: connectionId, balance: snapshot.balance, equity: snapshot.equity,
      margin: snapshot.margin, free_margin: snapshot.freeMargin, margin_level: snapshot.marginLevel,
      profit: snapshot.profit, credit: snapshot.credit, leverage: snapshot.leverage, currency: snapshot.currency
    });

    for (const p of positions) {
      if (!p.providerPositionId) continue;
      await supabase.from("mt5_positions").upsert({
        connection_id: connectionId, provider_position_id: p.providerPositionId, symbol: p.symbol,
        side: p.side, volume: p.volume, open_price: p.openPrice, current_price: p.currentPrice,
        stop_loss: p.stopLoss, take_profit: p.takeProfit, profit: p.profit, swap: p.swap,
        opened_at: p.openedAt, raw: p.raw
      }, { onConflict: "connection_id,provider_position_id" });
    }

    return NextResponse.json({
      snapshot: { ...snapshot, timestamp: new Date().toISOString() },
      positions,
      history: [],
      historyAvailable: false
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 500) : "MT5 refresh failed"
    }, { status: 502 });
  }
}
