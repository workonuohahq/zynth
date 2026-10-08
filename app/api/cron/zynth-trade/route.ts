import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const secret = req.headers.get("x-zynth-trade-secret");
  if (!process.env.ZYNTH_TRADE_CRON_SECRET || secret !== process.env.ZYNTH_TRADE_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("zynth_trade_scheduler_tick");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ZYNTH Trade scheduler failed." }, { status: 500 });
  }
}
