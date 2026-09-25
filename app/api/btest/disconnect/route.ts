import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MTAPI_BASE = (process.env.MTAPI_BASE_URL || "https://mt5.mtapi.io").replace(/\/$/, "");

export async function POST() {
  const token = cookies().get("zynth_btest_mtapi")?.value || "";
  const connectionId = cookies().get("zynth_btest_connection")?.value || "";
  if (token) {
    const url = new URL(MTAPI_BASE + "/Disconnect"); url.searchParams.set("id", token);
    await fetch(url, { cache: "no-store" }).catch(() => {});
  }
  if (connectionId) {
    const supabase = createSupabaseAdminClient();
    await supabase.from("btest_mt5_connections").update({ status: "disconnected" }).eq("id", connectionId);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("zynth_btest_mtapi");
  response.cookies.delete("zynth_btest_connection");
  return response;
}
