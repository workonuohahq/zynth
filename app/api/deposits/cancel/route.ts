import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.depositId || "");
    if (!id) return NextResponse.json({ error: "Deposit request is required." }, { status: 400 });
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.rpc("cancel_deposit_request", { p_user_id: user.id, p_deposit_id: id });
    if (error) {
      const status = /NOT_FOUND|NOT_PENDING|AUTHORIZATION/.test(error.message) ? 400 : 503;
      return NextResponse.json({ error: error.message === "DEPOSIT_NOT_PENDING" ? "This deposit is no longer pending." : "Unable to cancel this deposit.", code: error.message }, { status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unable to cancel this deposit." }, { status: 500 });
  }
}