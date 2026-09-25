import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.withdrawalId || "");
    if (!id) return NextResponse.json({ error: "Withdrawal request is required." }, { status: 400 });
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.rpc("cancel_withdrawal_request", { p_user_id: user.id, p_withdrawal_id: id });
    if (error) {
      const status = /NOT_FOUND|NOT_PENDING|AUTHORIZATION/.test(error.message) ? 400 : 503;
      return NextResponse.json({ error: error.message === "WITHDRAWAL_NOT_PENDING" ? "This withdrawal is no longer pending." : "Unable to cancel this withdrawal.", code: error.message }, { status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unable to cancel this withdrawal." }, { status: 500 });
  }
}