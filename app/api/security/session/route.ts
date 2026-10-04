import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PWA_TOKEN_HEADER, validatePwaCredential } from "@/lib/pwa/server";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const token = req.headers.get(PWA_TOKEN_HEADER);
  if (!token || !(await validatePwaCredential(supabase, user.id, token))) {
    return NextResponse.json({ error: "PWA credential required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "heartbeat");

  if (action === "heartbeat") {
    const { data, error } = await supabase.rpc("zynth_security_heartbeat", {
      p_session_key: token
    });
    return NextResponse.json({ active: !error && data === true });
  }

  if (action === "register") {
    const { data: deviceId, error: deviceError } = await supabase.rpc("zynth_security_register_device", {
      p_device_key: token,
      p_device_name: "ZYNTH installed app",
      p_device_type: "mobile",
      p_os_name: "PWA",
      p_os_version: null,
      p_browser_name: "Installed app",
      p_browser_version: null,
      p_app_mode: "standalone",
      p_user_agent: req.headers.get("user-agent"),
      p_ip_hash: null,
      p_ip_country: null,
      p_ip_region: null,
      p_ip_city: null
    });
    if (deviceError || !deviceId) {
      return NextResponse.json({ error: "Unable to register device." }, { status: 500 });
    }

    const { data: sessionId, error: sessionError } = await supabase.rpc("zynth_security_register_session", {
      p_session_key: token,
      p_device_id: deviceId,
      p_user_agent: req.headers.get("user-agent"),
      p_ip_hash: null,
      p_ip_country: null,
      p_ip_region: null,
      p_ip_city: null,
      p_session_family: token,
      p_expires_at: new Date(Date.now() + 2592000000).toISOString()
    });
    if (sessionError || !sessionId) {
      return NextResponse.json({ error: "Unable to register session." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deviceId, sessionId });
  }

  if (action === "revoke") {
    const { data, error } = await supabase.rpc("zynth_security_revoke_session", {
      p_session_id: String(body.sessionId || "")
    });
    if (error) return NextResponse.json({ error: "Unable to revoke session." }, { status: 400 });
    return NextResponse.json({ ok: data === true });
  }

  if (action === "revoke_all") {
    const { data, error } = await supabase.rpc("zynth_security_revoke_all_other_sessions", {
      p_current_session_id: String(body.currentSessionId || "")
    });
    if (error) return NextResponse.json({ error: "Unable to revoke other sessions." }, { status: 400 });
    return NextResponse.json({ ok: true, count: Number(data || 0) });
  }

  if (action === "revoke_device") {
    const { data, error } = await supabase.rpc("zynth_security_revoke_device", {
      p_device_id: String(body.deviceId || "")
    });
    if (error) return NextResponse.json({ error: "Unable to revoke that device." }, { status: 400 });
    return NextResponse.json({ ok: true, count: Number(data || 0) });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
