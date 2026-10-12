import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function GET() {
  try {
    const { user } = await getAdminContext();
    if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("zynth_registration_security").select("human_check_enabled,updated_at,updated_by").eq("id", true).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: data || { human_check_enabled: true, updated_at: null, updated_by: null } });
  } catch { return NextResponse.json({ error: "Unable to load registration security settings." }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  try {
    const { supabase, user } = await getAdminContext();
    if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (typeof body.humanCheckEnabled !== "boolean") return NextResponse.json({ error: "Choose whether Human Check should be enabled." }, { status: 400 });
    const { data, error } = await supabase.rpc("zynth_admin_set_registration_human_check", { p_admin_user_id: user.id, p_enabled: body.humanCheckEnabled });
    if (error) {
      const denied = String(error.message || "").includes("ADMIN_AUTHORIZATION_REQUIRED");
      return NextResponse.json({ error: denied ? "Administrator authorization required." : "Unable to save registration security settings." }, { status: denied ? 403 : 503 });
    }
    return NextResponse.json({ ok: true, settings: data });
  } catch {
    return NextResponse.json({ error: "Unable to save registration security settings." }, { status: 503 });
  }
}
