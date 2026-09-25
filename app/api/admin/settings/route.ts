import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.rpc("admin_overview");
    if (error) return NextResponse.json({ error: "Unable to load settings." }, { status: 503 });
    return NextResponse.json({ settings: data?.settings });
  } catch { return NextResponse.json({ error: "Unable to load settings." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json();
    const values = {
      min: Number(body?.minDeposit), yieldPct: Number(body?.yieldPct), feePct: Number(body?.exitFeePct), commissionPct: Number(body?.commissionPct), enabled: Boolean(body?.depositsEnabled),
      title: String(body?.depositPageTitle || ""), subtitle: String(body?.depositPageSubtitle || ""), notice: String(body?.depositPageNotice || ""), instructions: String(body?.depositInstructions || ""),
      fwEnabled: Boolean(body?.flutterwaveEnabled), fwTitle: String(body?.flutterwaveTitle || "Flutterwave"), fwName: String(body?.flutterwaveAccountName || ""), fwNumber: String(body?.flutterwaveAccountNumber || ""), fwBank: String(body?.flutterwaveBankName || ""), fwExtra: String(body?.flutterwaveExtra || ""),
      psEnabled: Boolean(body?.paystackEnabled), psTitle: String(body?.paystackTitle || "Paystack"), psName: String(body?.paystackAccountName || ""), psNumber: String(body?.paystackAccountNumber || ""), psBank: String(body?.paystackBankName || ""), psExtra: String(body?.paystackExtra || "")
    };
    if (!Number.isFinite(values.min) || values.min <= 0 || !Number.isFinite(values.yieldPct) || values.yieldPct < 0 || !Number.isFinite(values.feePct) || values.feePct < 0 || values.feePct > 100 || !Number.isFinite(values.commissionPct) || values.commissionPct < 0 || values.commissionPct > 100) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
    const { data, error } = await client.rpc("admin_set_system_settings", { p_admin_user_id: user.id, p_min_deposit: values.min, p_yield_pct: values.yieldPct, p_exit_fee_pct: values.feePct, p_commission_pct: values.commissionPct, p_deposits_enabled: values.enabled,
      p_deposit_page_title: values.title, p_deposit_page_subtitle: values.subtitle, p_deposit_page_notice: values.notice, p_deposit_instructions: values.instructions,
      p_flutterwave_enabled: values.fwEnabled, p_flutterwave_title: values.fwTitle, p_flutterwave_account_name: values.fwName, p_flutterwave_account_number: values.fwNumber, p_flutterwave_bank_name: values.fwBank, p_flutterwave_extra: values.fwExtra,
      p_paystack_enabled: values.psEnabled, p_paystack_title: values.psTitle, p_paystack_account_name: values.psName, p_paystack_account_number: values.psNumber, p_paystack_bank_name: values.psBank, p_paystack_extra: values.psExtra });
    if (error) return NextResponse.json({ error: "Unable to update settings.", code: error.message }, { status: 400 });
    const { data: withdrawalSettings, error: withdrawalError } = await client.rpc("admin_set_withdrawal_settings", { p_admin_user_id: user.id, p_min_withdrawal: Number(body?.minWithdrawal), p_enabled: body?.withdrawalsEnabled === true, p_notice: String(body?.withdrawalNotice ?? "") });
    if (withdrawalError) return NextResponse.json({ error: "Core settings saved, but withdrawal settings could not be updated.", code: withdrawalError.message }, { status: 400 });
    return NextResponse.json({ ok: true, settings: { ...data, ...withdrawalSettings } });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to update settings." }, { status: 500 }); }
}
