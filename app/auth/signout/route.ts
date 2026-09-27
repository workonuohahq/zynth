import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashPwaToken } from "@/lib/pwa/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = request.headers.get("x-zynth-pwa-token");
  if (user && token) {
    await supabase.from("zynth_pwa_devices").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).eq("token_hash", hashPwaToken(token)).is("revoked_at", null);
  }
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url));
}