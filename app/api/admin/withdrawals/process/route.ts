import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const withdrawalId = String(body?.withdrawalId || "");
    const approved = body?.approved === true;
    const reason = typeof body?.reason === "string" ? body.reason : null;
    if (!withdrawalId) return NextResponse.json({ error: "Withdrawal ID is required." }, { status: 400 });
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.rpc("process_withdrawal", { p_withdrawal_id: withdrawalId, p_approved: approved, p_admin_user_id: user.id, p_failure_reason: reason });
    if (error) return NextResponse.json({ error: "Unable to process withdrawal.", code: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, result: data });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to process withdrawal." }, { status: 500 }); }
}
