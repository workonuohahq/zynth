import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const PWA_COOKIE = "zynth_pwa_access";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PWA_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}