import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { connectMT5, getMT5Account, normalizeAccount } from "@/lib/mt5/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const login = String(body.login || "").trim();
  const password = String(body.password || "");
  const server = String(body.server || "").trim();
  if (!/^\d+$/.test(login) || !password || !server) {
    return NextResponse.json({ error: "MT5 login, server and password are required." }, { status: 400 });
  }

  try {
    const upstream = await connectMT5({ login, password, server });
    const providerAccountId = String(upstream?.id ?? upstream?.data?.id ?? upstream?.account?.id ?? "");
    if (!providerAccountId) throw new Error("MT5API connected but returned no account ID.");

    const accountRaw = await getMT5Account(providerAccountId);
    const snapshot = normalizeAccount(accountRaw, { login, server, providerAccountId });
    const supabase = createSupabaseAdminClient();

    const { data: connection, error } = await supabase.from("mt5_connections").upsert({
      user_id: user.id,
      provider: "mt5api",
      provider_account_id: providerAccountId,
      mt5_login: login,
      mt5_server: server,
      status: "connected",
      last_seen_at: new Date().toISOString()
    }, { onConflict: "user_id,provider,provider_account_id" }).select("id,provider_account_id,mt5_login,mt5_server").single();
    if (error) throw error;

    await supabase.from("mt5_account_snapshots").insert({
      connection_id: connection.id,
      balance: snapshot.balance,
      equity: snapshot.equity,
      margin: snapshot.margin,
      free_margin: snapshot.freeMargin,
      margin_level: snapshot.marginLevel,
      profit: snapshot.profit,
      credit: snapshot.credit,
      leverage: snapshot.leverage,
      currency: snapshot.currency
    });

    const response = NextResponse.json({
      connectionId: connection.id,
      snapshot: { ...snapshot, timestamp: new Date().toISOString() }
    });
    response.cookies.set("zynth_btest_provider_account", providerAccountId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/btest", maxAge: 28800
    });
    response.cookies.set("zynth_btest_connection", connection.id, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/btest", maxAge: 28800
    });
    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 500) : "MT5 connection failed"
    }, { status: 502 });
  }
}
