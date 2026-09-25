import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MTAPI_BASE = (process.env.MTAPI_BASE_URL || "https://mt5.mtapi.io").replace(/\/$/, "");

export async function GET() {
  const token = cookies().get("zynth_btest_mtapi")?.value || "";
  const connectionId = cookies().get("zynth_btest_connection")?.value || "";
  if (!token || !connectionId) return NextResponse.json({ error: "MT5 session expired. Connect again from BTest." }, { status: 401 });

  try {
    await ensureConnection(token);
    const account = await getJson("AccountSummary", token);
    const snapshot = normalize(account);
    const supabase = createSupabaseAdminClient();
    const { data: connection } = await supabase.from("btest_mt5_connections").select("id, mt5_login, mt5_server").eq("id", connectionId).maybeSingle();
    if (!connection) return NextResponse.json({ error: "MT5 connection record was not found." }, { status: 404 });

    await supabase.from("btest_mt5_connections").update({ status: "connected", last_seen_at: new Date().toISOString() }).eq("id", connectionId);
    await supabase.from("btest_mt5_snapshots").insert({
      connection_id: connectionId, balance: snapshot.balance, equity: snapshot.equity, margin: snapshot.margin,
      free_margin: snapshot.freeMargin, margin_level: snapshot.marginLevel, profit: snapshot.profit, credit: snapshot.credit,
      leverage: snapshot.leverage, currency: snapshot.currency, server: snapshot.server || connection.mt5_server
    });

    const [positions, history] = await Promise.all([
      getJson("OpenedOrders", token).catch(() => []),
      getOrderHistory(token)
    ]);
    return NextResponse.json({
      snapshot: { ...snapshot, login: connection.mt5_login, server: snapshot.server || connection.mt5_server, timestamp: new Date().toISOString() },
      positions: Array.isArray(positions) ? positions : [],
      history: Array.isArray(history) ? history : []
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 500) : "MT5 refresh failed" }, { status: 502 });
  }
}

async function ensureConnection(id: string) {
  const url = new URL(MTAPI_BASE + "/CheckConnect"); url.searchParams.set("id", id);
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error("MT5 session is no longer connected. Reconnect the account.");
}
async function getJson(endpoint: string, id: string) {
  const url = new URL(MTAPI_BASE + "/" + endpoint); url.searchParams.set("id", id);
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error || data?.exception) throw new Error(endpoint + " request failed");
  return data;
}
async function getOrderHistory(id: string) {
  const url = new URL(MTAPI_BASE + "/OrderHistory");
  url.searchParams.set("id", id); url.searchParams.set("from", "1970-01-01T00:00:00"); url.searchParams.set("to", new Date().toISOString());
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => []);
  return res.ok && Array.isArray(data) ? data : [];
}
function normalize(info: any) {
  return {
    balance: Number(info.balance ?? 0), equity: Number(info.equity ?? 0), margin: Number(info.margin ?? 0),
    freeMargin: Number(info.freeMargin ?? 0), marginLevel: info.marginLevel == null ? null : Number(info.marginLevel),
    profit: Number(info.profit ?? 0), credit: Number(info.credit ?? 0), leverage: info.leverage == null ? null : Number(info.leverage),
    currency: String(info.currency ?? ""), server: String(info.server ?? "")
  };
}
