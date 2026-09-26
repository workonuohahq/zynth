import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function adminContext() {
  const s = await createSupabaseServerClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { s, user: null, error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const { data: p } = await s.from("users").select("role").eq("id", user.id).single();
  if (p?.role !== "admin") return { s, user, error: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  return { s, user, error: null };
}

export async function GET() {
  const { s, user, error } = await adminContext();
  if (error || !user) return error!;
  const { data, error: rpcError } = await s.rpc("zynth_admin_get_settings", { p_admin_id: user.id });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(req: Request) {
  const { s, user, error } = await adminContext();
  if (error || !user) return error!;
  const b = await req.json().catch(() => ({}));
  const { data, error: rpcError } = await s.rpc("zynth_admin_set_investment_settings", {
    p_admin_id: user.id,
    p_investment_enabled: Boolean(b.investment_enabled),
    p_strategy_entry_enabled: Boolean(b.strategy_entry_enabled),
    p_strategy_exit_enabled: Boolean(b.strategy_exit_enabled),
    p_vault_profit_lock_days: Number(b.vault_profit_lock_days),
    p_min_deposit: Number(b.global_min_deposit),
    p_min_withdrawal: Number(b.global_min_withdrawal),
    p_deposits_enabled: Boolean(b.deposits_enabled),
    p_withdrawals_enabled: Boolean(b.withdrawals_enabled),
    p_exit_fee_pct: Number(b.exit_fee_pct),
    p_settlement_enabled: Boolean(b.settlement_enabled),
    p_settlement_timezone: String(b.settlement_timezone || "Africa/Lagos"),
    p_settlement_cutoff_time: String(b.settlement_cutoff_time || "23:59:00"),
    p_legacy_settlement_check: false,
    p_require_flat_trading_day: Boolean(b.require_flat_trading_day),
    p_deposit_page_title: String(b.deposit_page_title || "Fund your wallet"),
    p_deposit_page_subtitle: String(b.deposit_page_subtitle || ""),
    p_deposit_page_notice: String(b.deposit_page_notice || ""),
    p_deposit_instructions: String(b.deposit_instructions || ""),
    p_flutterwave_enabled: Boolean(b.flutterwave_enabled),
    p_flutterwave_title: String(b.flutterwave_title || "Flutterwave"),
    p_flutterwave_account_name: String(b.flutterwave_account_name || ""),
    p_flutterwave_account_number: String(b.flutterwave_account_number || ""),
    p_flutterwave_bank_name: String(b.flutterwave_bank_name || ""),
    p_flutterwave_extra: String(b.flutterwave_extra || ""),
    p_paystack_enabled: Boolean(b.paystack_enabled),
    p_paystack_title: String(b.paystack_title || "Paystack"),
    p_paystack_account_name: String(b.paystack_account_name || ""),
    p_paystack_account_number: String(b.paystack_account_number || ""),
    p_paystack_bank_name: String(b.paystack_bank_name || ""),
    p_paystack_extra: String(b.paystack_extra || ""),
    p_withdrawal_processing_notice: String(b.withdrawal_processing_notice || "")
  });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });
  return NextResponse.json({ settings: data });
}
