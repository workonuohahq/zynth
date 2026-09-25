import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const s = await createSupabaseServerClient();
    const { data: { user } } = await s.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const [{ data: u, error: userError }, { data: settings, error: settingsError }] =
      await Promise.all([
        s
          .from("users")
          .select("main_wallet_balance,locked_vault_balance")
          .eq("id", user.id)
          .single(),
        s.rpc("get_withdrawal_policy"),
      ]);

    if (userError || settingsError || !u || !settings) {
      return NextResponse.json(
        { error: "Unable to load withdrawal settings." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        available: Number(u.main_wallet_balance),
        locked: Number(u.locked_vault_balance),
        exitFeePct: Number(settings.exit_fee_pct),
        minWithdrawal: Number(settings.global_min_withdrawal),
        withdrawalsEnabled: Boolean(settings.withdrawals_enabled),
        withdrawalNotice: String(settings.withdrawal_processing_notice || ""),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load account summary." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
