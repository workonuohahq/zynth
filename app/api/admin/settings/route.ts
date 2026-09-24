import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile } = await client.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("system_settings").select("*").single();
  if (error) return NextResponse.json({ error: "Unable to load settings." }, { status: 503 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profile } = await client.from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const body = await request.json();
    const values = { min: Number(body?.minDeposit), yieldPct: Number(body?.yieldPct), feePct: Number(body?.exitFeePct), commissionPct: Number(body?.commissionPct), enabled: Boolean(body?.depositsEnabled) };
    if (!Number.isFinite(values.min) || !Number.isFinite(values.yieldPct) || !Number.isFinite(values.feePct) || !Number.isFinite(values.commissionPct)) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("admin_set_system_settings", { p_admin_user_id: user.id, p_min_deposit: values.min, p_yield_pct: values.yieldPct, p_exit_fee_pct: values.feePct, p_commission_pct: values.commissionPct, p_deposits_enabled: values.enabled });
    if (error) return NextResponse.json({ error: "Unable to update settings.", code: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update settings." }, { status: 500 });
  }
}
