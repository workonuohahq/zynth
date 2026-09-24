import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });

    const userClient = await createSupabaseServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("create_vault", { p_user_id: user.id, p_amount: amount });
    if (error) {
      const status = /INSUFFICIENT|BELOW_MINIMUM|INVALID_AMOUNT|USER_NOT_FOUND/.test(error.message) ? 400 : 503;
      return NextResponse.json({ error: "Unable to create vault.", code: error.message }, { status });
    }
    return NextResponse.json({ ok: true, vault: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create vault." }, { status: 500 });
  }
}