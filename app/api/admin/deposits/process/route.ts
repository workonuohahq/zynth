import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const body = await request.json();
    const depositId = String(body?.depositId || "");
    const approved = Boolean(body?.approved);
    const note = String(body?.note || "");

    if (!depositId) return NextResponse.json({ error: "Deposit request is required." }, { status: 400 });

    const { data, error } = await client.rpc("admin_process_deposit", {
      p_admin_user_id: user.id,
      p_deposit_id: depositId,
      p_approved: approved,
      p_admin_note: note || null
    });

    if (error) {
      const status = /NOT_FOUND|ALREADY_PROCESSED|authorization required/.test(error.message) ? 400 : 503;
      return NextResponse.json({ error: "Unable to process deposit.", code: error.message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to process deposit." }, { status: 500 });
  }
}