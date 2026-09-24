import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("system_settings").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, service: "zynth", database: "connected" });
  } catch {
    return NextResponse.json({ ok: false, service: "zynth", database: "unavailable" }, { status: 503 });
  }
}