import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.ZYNTH_DEPOSIT_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-zynth-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const userId = String(body?.user_id || "");
    const amount = Number(body?.amount);
    const reference = String(body?.reference || "");

    if (!userId || !reference || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("credit_deposit", {
      p_user_id: userId,
      p_amount: amount,
      p_external_reference: reference
    });

    if (error) {
      const status = /BELOW_MINIMUM|INVALID_DEPOSIT|REFERENCE_REQUIRED|USER_NOT_FOUND/.test(error.message) ? 400 : 503;
      return NextResponse.json({ error: "Deposit could not be processed.", code: error.message }, { status });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Invalid webhook request." }, { status: 400 });
  }
}