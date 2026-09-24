import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
    }

    const userClient = await createSupabaseServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id,main_wallet_balance")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) return NextResponse.json({ error: "User profile not found." }, { status: 404 });

    const { data: settings, error: settingsError } = await admin
      .from("system_settings")
      .select("global_min_deposit,current_yield_pct,deposits_enabled")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();
    if (settingsError || !settings) throw settingsError || new Error("Settings unavailable");
    if (!settings.deposits_enabled) return NextResponse.json({ error: "Vault deposits are temporarily disabled." }, { status: 403 });
    if (amount < Number(settings.global_min_deposit)) return NextResponse.json({ error: `Minimum vault amount is ₦${Number(settings.global_min_deposit).toLocaleString()}.` }, { status: 400 });
    if (Number(profile.main_wallet_balance) < amount) return NextResponse.json({ error: "Insufficient wallet balance." }, { status: 400 });

    // Final money movement must be moved to an atomic database transaction before real deposits are enabled.
    // This route intentionally refuses to mutate balances until the atomic RPC is installed.
    return NextResponse.json({ error: "Vault engine is not yet enabled for live funds.", code: "VAULT_ENGINE_PENDING" }, { status: 503 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create vault." }, { status: 500 });
  }
}