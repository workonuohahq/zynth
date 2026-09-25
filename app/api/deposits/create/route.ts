import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Number(body?.amount);
    const method = String(body?.method || "manual");

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
    }

    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data, error } = await client.rpc("create_deposit_request", {
      p_user_id: user.id,
      p_amount: amount,
      p_method: method
    });

    if (error) {
      const status = /BELOW_MINIMUM|INVALID_AMOUNT|INVALID_METHOD|DEPOSITS_DISABLED|AUTHORIZATION|PENDING_DEPOSIT_EXISTS|PENDING_WITHDRAWAL_EXISTS/.test(error.message) ? 400 : 503;
      return NextResponse.json({ error: error.message === "DEPOSITS_DISABLED" ? "Deposits are temporarily paused." : error.message === "PENDING_DEPOSIT_EXISTS" ? "You already have a pending deposit. Check Activity to view its status or cancel it before starting another." : error.message === "PENDING_WITHDRAWAL_EXISTS" ? "You have a pending withdrawal. Complete or cancel it before starting a new deposit." : "Unable to start the payment request.", code: error.message }, { status });
    }

    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to start the payment request." }, { status: 500 });
  }
}