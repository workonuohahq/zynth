import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
function fingerprint(request: Request) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(ip + "|" + agent).digest("hex");
}
function clean(value: unknown, max = 160) { return String(value ?? "").trim().slice(0, max); }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = clean(body?.email, 254).toLowerCase();
    const password = String(body?.password ?? "");
    const fullName = clean(body?.fullName, 120);
    const referralCode = clean(body?.referralCode, 80);
    const zpaCode = clean(body?.zpaCode, 80);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !fullName) {
      return NextResponse.json({ error: "Enter a valid email, your full name, and a password of at least 8 characters." }, { status: 400 });
    }
    const db = createSupabaseAdminClient();
    const fp = fingerprint(request);
    const { data: setting, error: settingError } = await db.from("zynth_registration_security").select("human_check_enabled").eq("id", true).maybeSingle();
    if (settingError) throw settingError;
    const enabled = setting?.human_check_enabled !== false; // Fail closed if the security setting is missing.
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count, error: countError } = await db.from("zynth_human_check_events").select("id", { count: "exact", head: true }).eq("fingerprint", fp).eq("event_type", "registration").gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 8) return NextResponse.json({ error: "Too many registration attempts. Please try again later." }, { status: 429 });
    const failedSince = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count: failedCount, error: failedCountError } = await db.from("zynth_human_check_events").select("id", { count: "exact", head: true }).eq("fingerprint", fp).eq("event_type", "failed").gte("created_at", failedSince);
    if (failedCountError) throw failedCountError;
    if ((failedCount || 0) >= 20) return NextResponse.json({ error: "Too many failed verification attempts. Please try again later." }, { status: 429 });
    if (enabled) {
      const challengeId = clean(body?.challengeId, 64);
      const answer = clean(body?.answer, 40).toLowerCase();
      if (!challengeId || !answer) return NextResponse.json({ error: "Complete ZYNTH Human Check before creating your account.", code: "HUMAN_CHECK_REQUIRED" }, { status: 400 });
      const { data: result, error: verifyError } = await db.rpc("zynth_human_check_consume", { p_challenge_id: challengeId, p_answer: answer, p_fingerprint: fp });
      if (verifyError) throw verifyError;
      if (result?.ok !== true) {
        await db.from("zynth_human_check_events").insert({ event_type: "failed", fingerprint: fp });
        return NextResponse.json({ error: result?.reason === "expired" ? "That challenge expired. Get a new challenge and try again." : result?.reason === "used" ? "That challenge has already been used. Get a new one." : "That answer was not accepted. Check the symbols and try again.", code: "HUMAN_CHECK_FAILED" }, { status: 400 });
      }
    }
    const { error: eventError } = await db.from("zynth_human_check_events").insert({ event_type: "registration", fingerprint: fp });
    if (eventError) throw eventError;
    const metadata: Record<string, string> = { full_name: fullName };
    if (referralCode) metadata.zynth_referral_code = referralCode;
    if (zpaCode) metadata.zynth_zpa_code = zpaCode;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message);
      return NextResponse.json({ error: duplicate ? "An account with this email may already exist. Try signing in or resetting your password." : "We could not create your account. Please check your details and try again." }, { status: duplicate ? 409 : 400 });
    }
    if (!data.user) return NextResponse.json({ error: "Account creation could not be confirmed. Please try signing in." }, { status: 500 });
    return NextResponse.json({ ok: true, email: data.user.email });
  } catch (error) {
    console.error("ZYNTH registration failed", error);
    return NextResponse.json({ error: "Registration is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
