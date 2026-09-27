import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validatePwaCredential, PWA_TOKEN_HEADER } from "@/lib/pwa/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const token = request.headers.get(PWA_TOKEN_HEADER);
  const valid = await validatePwaCredential(supabase, user.id, token);
  return valid ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "PWA credential required." }, { status: 403 });
}
