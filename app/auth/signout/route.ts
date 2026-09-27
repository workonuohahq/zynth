import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PWA_COOKIE = "zynth_pwa_v2";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut({ scope: "local" });

  const response = NextResponse.redirect(new URL("/login", request.url));

  // The PWA capability must die with the authenticated session. Without this,
  // signing out of the installed app can leave the capability cookie behind,
  // allowing a later browser login in the same browser profile to bypass /install.
  response.cookies.set(PWA_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
