import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const [
      { data: summary, error: summaryError },
      { data: policyRows, error: policyError },
      { data: balances, error: balancesError },
      { data: roles, error: rolesError },
      { data: pendingWithdrawals, error: pendingWithdrawalsError },
    ] = await Promise.all([
      supabase.rpc("zynth_investor_summary", { p_user_id: user.id }),
      supabase.rpc("get_withdrawal_policy"),
      supabase.rpc("zynth_withdrawable_balances", { p_user_id: user.id }),
      supabase.rpc("zynth_get_my_roles", { p_user_id: user.id }),
      supabase
        .from("withdrawal_requests")
        .select("net_amount")
        .eq("user_id", user.id)
        .in("status", ["pending", "under_review", "processing"]),
    ]);

    const policy = Array.isArray(policyRows) ? policyRows[0] : policyRows;

    if (
      summaryError ||
      policyError ||
      balancesError ||
      rolesError ||
      pendingWithdrawalsError
    ) {
      return NextResponse.json(
        { error: "Unable to load account summary." },
        { status: 503 },
      );
    }

    const sourceBalances = balances || {};
    const roleKeys = Array.isArray(roles) ? roles : [];

    // Require both independent role-aware sources to confirm ZPA access.
    // This prevents an earnings balance from appearing for an unassigned user.
    const hasZpa = roleKeys.includes("zpa") && sourceBalances.has_zpa === true;
    const pendingWithdrawal = (pendingWithdrawals || []).reduce(
      (total, request) => total + Number(request.net_amount || 0),
      0,
    );

    return NextResponse.json(
      {
        summary: summary || {},
        available: Number(summary?.cash || 0),
        withdrawableCash: Number(
          sourceBalances.available_cash ?? summary?.cash ?? 0,
        ),
        pendingWithdrawal,
        zpaEarnings: hasZpa ? Number(sourceBalances.zpa_earnings || 0) : 0,
        hasZpa,
        roles: roleKeys,
        totalWithdrawable: Number(sourceBalances.total_withdrawable || 0),
        exitFeePct: Number(policy?.exit_fee_pct || 0),
        withdrawalFeePct: Number(policy?.withdrawal_fee_pct || 0),
        withdrawalFeeFixed: Number(policy?.withdrawal_fee_fixed || 0),
        minWithdrawal: Number(policy?.global_min_withdrawal || 0),
        withdrawalsEnabled: Boolean(policy?.withdrawals_enabled),
        withdrawalNotice: String(policy?.withdrawal_processing_notice || ""),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load account summary." },
      { status: 500 },
    );
  }
}
