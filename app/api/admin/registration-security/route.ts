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
    const { user } = await getAdminContext();
    if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (typeof body.humanCheckEnabled !== "boolean") return NextResponse.json({ error: "Choose whether Human Check should be enabled." }, { status: 400 });
    const db = createSupabaseAdminClient();
    const { data: before } = await db.from("zynth_registration_security").select("human_check_enabled").eq("id", true).maybeSingle();
    const { data, error } = await db.from("zynth_registration_security").upsert({ id: true, human_check_enabled: body.humanCheckEnabled, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "id" }).select("human_check_enabled,updated_at,updated_by").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor_user_id: user.id, action: "registration.human_check_updated", target_type: "registration_security", target_id: user.id, metadata: { previous_enabled: before?.human_check_enabled ?? true, new_enabled: body.humanCheckEnabled } });
    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    console.error("Registration security update failed", error);
    return NextResponse.json({ error: "Unable to save registration security settings." }, { status: 503 });
  }
}
