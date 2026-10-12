import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${SUPABASE_URL}/functions/v1/zynth-registration`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "x-real-ip": request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
        "user-agent": request.headers.get("user-agent") || "",
      },
      body: JSON.stringify({ ...body, action: "register" }),
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("ZYNTH registration request failed", error);
    return NextResponse.json({ error: "Registration is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
