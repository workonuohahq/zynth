import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";

export async function GET() {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const { data, error } = await supabase.rpc("zynth_admin_get_registration_human_check", {
    p_admin_user_id: user.id,
  });
  if (error) {
    console.error("Registration security settings read failed", error);
    return NextResponse.json({ error: "Unable to load registration security settings." }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "Registration security settings are unavailable." }, { status: 503 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.humanCheckEnabled !== "boolean") {
    return NextResponse.json({ error: "Choose whether Human Check should be enabled." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("zynth_admin_set_registration_human_check", {
    p_admin_user_id: user.id,
    p_enabled: body.humanCheckEnabled,
  });
  if (error) {
    const denied = String(error.message || "").includes("ADMIN_AUTHORIZATION_REQUIRED");
    console.error("Registration security settings update failed", error);
    return NextResponse.json(
      { error: denied ? "Administrator authorization required." : "Unable to save registration security settings." },
      { status: denied ? 403 : 503 },
    );
  }
  return NextResponse.json({ ok: true, settings: data });
}
