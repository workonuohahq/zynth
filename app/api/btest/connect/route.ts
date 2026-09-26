import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateMT5Login } from "@/lib/mt5/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  try {
    const input = validateMT5Login({
      login: String(body.login || ""),
      server: String(body.server || "")
    });

    const supabase = createSupabaseAdminClient();
    const { data: account, error } = await supabase.from("mt5_accounts")
      .upsert({
        user_id: user.id,
        login: input.login,
        server: input.server,
        label: String(body.label || "").trim() || null,
        status: "connected",
        last_seen_at: new Date().toISOString()
      }, { onConflict: "user_id,login,server" })
      .select("id,login,server,status")
      .single();

    if (error) throw error;

    const response = NextResponse.json({
      accountId: account.id,
      account: {
        login: account.login,
        server: account.server,
        status: account.status
      },
      dataSource: "mt5-terminal-bridge"
    });

    response.cookies.set("zynth_btest_account", account.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/btest",
      maxAge: 28800
    });

    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 500) : "MT5 account setup failed"
    }, { status: 400 });
  }
}
