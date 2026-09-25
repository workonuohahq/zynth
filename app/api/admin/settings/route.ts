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
    const values = { min: Number(body?.minDeposit), yieldPct: Number(body?.yieldPct), feePct: Number(body?.exitFeePct), commissionPct: Number(body?.commissionPct), enabled: Boolean(body?.depositsEnabled) };
    if (!Number.isFinite(values.min) || values.min <= 0 || !Number.isFinite(values.yieldPct) || values.yieldPct < 0 || !Number.isFinite(values.feePct) || values.feePct < 0 || values.feePct > 100 || !Number.isFinite(values.commissionPct) || values.commissionPct < 0 || values.commissionPct > 100) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
    const { data, error } = await client.rpc("admin_set_system_settings", { p_admin_user_id: user.id, p_min_deposit: values.min, p_yield_pct: values.yieldPct, p_exit_fee_pct: values.feePct, p_commission_pct: values.commissionPct, p_deposits_enabled: values.enabled });
    if (error) return NextResponse.json({ error: "Unable to update settings.", code: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to update settings." }, { status: 500 }); }
}
