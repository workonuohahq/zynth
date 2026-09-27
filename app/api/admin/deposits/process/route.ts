import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export async function POST(request: Request) {
  try {
    const { supabase: client, user } = await getAdminContext();
    if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const body = await request.json();
    const depositId = String(body?.depositId || "");
    const approved = Boolean(body?.approved);
    const note = String(body?.note || "");

    if (!depositId) return NextResponse.json({ error: "Deposit request is required." }, { status: 400 });

    const { data, error } = await client.rpc("zynth_admin_process_deposit_v2", {
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