import { randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashPwaToken } from "@/lib/pwa/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashPwaToken(token);

  const { error } = await supabase.from("zynth_pwa_devices").insert({
    user_id: user.id,
    token_hash: tokenHash
  });

  if (error) {
    return NextResponse.json({ error: "Unable to create secure app credential." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }

  // The PWA credential is the single device/session identity. Security
  // registration is deliberately best-effort so security telemetry can never
  // break the actual PWA activation flow.
  try {
    const userAgent = "";
    const { data: deviceId } = await supabase.rpc("zynth_security_register_device", {
      p_device_key: token,
      p_device_name: "ZYNTH installed app",
      p_device_type: "mobile",
      p_os_name: "PWA",
      p_os_version: null,
      p_browser_name: "Installed app",
      p_browser_version: null,
      p_app_mode: "standalone",
      p_user_agent: userAgent,
      p_ip_hash: null,
      p_ip_country: null,
      p_ip_region: null,
      p_ip_city: null
    });

    if (deviceId) {
      await supabase.rpc("zynth_security_register_session", {
        p_session_key: token,
        p_device_id: deviceId,
        p_user_agent: userAgent,
        p_ip_hash: null,
        p_ip_country: null,
        p_ip_region: null,
        p_ip_city: null,
        p_session_family: token,
        p_expires_at: new Date(Date.now() + 2592000000).toISOString()
      });
    }
  } catch {
    // PWA access remains valid even if security telemetry is temporarily unavailable.
  }

  return NextResponse.json({ ok: true, token }, { headers: { "Cache-Control": "private, no-store" } });
}
