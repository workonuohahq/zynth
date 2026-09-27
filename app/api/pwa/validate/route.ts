import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validatePwaCredential, hashPwaToken, PWA_TOKEN_HEADER } from "@/lib/pwa/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const token = request.headers.get(PWA_TOKEN_HEADER);
  const valid = await validatePwaCredential(supabase, user.id, token);
  if (!valid) return NextResponse.json({ error: "PWA credential required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  await supabase.from("zynth_pwa_devices").update({ last_seen_at: new Date().toISOString() }).eq("user_id", user.id).eq("token_hash", await hashPwaToken(token!)).is("revoked_at", null);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}