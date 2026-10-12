import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode") === "text" ? "text" : "visual";
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
      body: JSON.stringify({ action: "challenge", mode }),
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Human Check challenge request failed", error);
    return NextResponse.json({ error: "Human verification is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
