import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

const PUSH_CONFIG_ORIGIN = "https://zynth-lywd.onrender.com";

export async function GET(){
  const localKey = process.env.NEXT_PUBLIC_ZYNTH_VAPID_PUBLIC_KEY?.trim();
  if (localKey) {
    return NextResponse.json({publicKey: localKey});
  }

  // Render is the authoritative push worker, so use its public VAPID key as the
  // fallback. The key is intentionally public; the matching private key remains
  // server-side on Render and is never proxied to the browser.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${PUSH_CONFIG_ORIGIN}/api/push/public-config`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {"accept":"application/json"},
    });
    if (!response.ok) {
      return NextResponse.json({error:"Push notifications are not configured."},{status:503});
    }

    const body = await response.json().catch(() => null);
    const publicKey = typeof body?.publicKey === "string" ? body.publicKey.trim() : "";
    if (!publicKey) {
      return NextResponse.json({error:"Push notifications are not configured."},{status:503});
    }

    return NextResponse.json({publicKey});
  } catch {
    return NextResponse.json({error:"Push notifications are temporarily unavailable."},{status:503});
  } finally {
    clearTimeout(timeout);
  }
}
