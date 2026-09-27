import { randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashPwaToken } from "@/lib/pwa/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("zynth_pwa_devices").insert({
    user_id: user.id,
    token_hash: await hashPwaToken(token)
  });
  if (error) return NextResponse.json({ error: "Unable to create secure app credential." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ ok: true, token }, { headers: { "Cache-Control": "private, no-store" } });
}